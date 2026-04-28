import type * as AstroContent from 'astro:content'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import { Feed } from 'feed'
import type { ResolvedFeedKitConfig, Source } from './config'
import type { Item } from './schemas'
import { getFeedContent } from './collection'
import { createContainer, resolveContainerRenderers } from './container'
import { resolveItemFields } from './item-map'
import { sanitizeHtml } from './sanitize'
import { ItemSchema } from './schemas'

/**
 * `astro:content` is a Vite virtual module — it only resolves inside code that
 * runs through Vite's module graph. We dynamically import it at call time so
 * the package's barrel can be loaded from `astro.config.ts` (where Vite is not
 * yet active) without crashing.
 */
type AstroContentRender = typeof AstroContent.render

/**
 * Upper bound on concurrent `buildItem` calls. The per-item pipeline is
 * CPU-bound (linkedom parse → Defuddle → unified) but async boundaries let the
 * event loop interleave work, and the `AstroContainer` is reentrant —
 * concurrent `renderToString` calls are how Astro's own SSR path already runs.
 * Eight is a deliberate cap: past that, resident memory during large feed
 * generation grows faster than throughput improves.
 */
const MAX_CONCURRENCY = 8

function maxDate(dates: Date[]): Date | undefined {
	if (dates.length === 0) {
		return undefined
	}

	let max = dates[0]!
	for (const date of dates) {
		if (date.getTime() > max.getTime()) {
			max = date
		}
	}

	return max
}

/**
 * Run `fn` over `items` with at most `concurrency` tasks in flight. Results are
 * written into their original index, so the returned array mirrors the input
 * order regardless of task-completion order — important because the default
 * merged-item sort is stable, and callers rely on deterministic output for
 * equal sort keys.
 *
 * Fail-fast: the first rejection stops new tasks from starting and propagates
 * out. In-flight tasks run to completion (they can't be cancelled), but no
 * further work is dispatched.
 */
async function mapConcurrent<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = Array.from<R>({ length: items.length })
	const workerCount = Math.min(concurrency, items.length)
	let cursor = 0
	let failed = false

	async function worker(): Promise<void> {
		while (!failed) {
			const index = cursor++
			if (index >= items.length) {
				return
			}

			try {
				results[index] = await fn(items[index]!)
			} catch (error) {
				failed = true
				throw error
			}
		}
	}

	const workers: Array<Promise<void>> = []
	for (let w = 0; w < workerCount; w += 1) {
		workers.push(worker())
	}

	await Promise.all(workers)
	return results
}

/**
 * Render a single entry through the pipeline: run the resolver to derive the
 * link (and other fields), render and sanitize its HTML (skipped when
 * `config.includeContent` is `false`), then populate `content` from the
 * sanitized HTML unless the resolver already set one.
 *
 * `container` may be `undefined` when content is excluded — there's nothing to
 * render, and `createContainer` is bypassed up the call chain to avoid its
 * dynamic-import cost entirely.
 */
async function buildItem(
	entry: CollectionEntry<CollectionKey>,
	source: Source,
	config: ResolvedFeedKitConfig,
	container: Awaited<ReturnType<typeof createContainer>> | undefined,
	siteUrl: string,
	render: AstroContentRender | undefined,
): Promise<Item> {
	const partial = resolveItemFields({ entry, siteUrl }, source.resolveItem)
	// `defaultItemResolver` always sets `link`; the user's resolver may
	// override it. Either way, `partial.link` is defined here.
	const { link } = partial
	if (link === undefined) {
		throw new Error(
			`astro-feed-kit: resolveItem returned link: undefined for ${entry.collection}/${entry.id}. ` +
				'Return a string (or omit the field to use the default) so sanitize has a base URL.',
		)
	}

	let renderedHtml = ''
	if (container !== undefined && render !== undefined) {
		const { Content } = await render(entry)
		const rawHtml = await container.renderToString(Content)
		renderedHtml = await sanitizeHtml(rawHtml, link, config.excerptBoundary)
	}

	const assembled: Record<string, unknown> = {
		...partial,
		id: partial.id ?? link,
	}
	// `includeContent: false` is authoritative — drop any `content` the
	// resolver produced so the field is omitted from the feed. Otherwise,
	// the resolver's explicit value wins; fall through to the sanitized
	// render when the resolver left it alone.
	if (config.includeContent) {
		assembled.content ??= renderedHtml === '' ? undefined : renderedHtml
	} else {
		delete assembled.content
	}

	const result = ItemSchema.safeParse(assembled)
	if (!result.success) {
		throw new Error(
			`Failed to build feed item for ${entry.collection}/${entry.id}: ${result.error.message}`,
		)
	}

	return result.data
}

/**
 * Generate a populated `Feed` instance from a `ResolvedFeedKitConfig`. The
 * returned feed can be serialized via `feed.rss2()`, `feed.atom1()`, or
 * `feed.json1()`.
 *
 * Steps: load and validate eligible entries per source, build an Astro
 * container for the configured renderers, render and sanitize each entry's
 * HTML, run the resolver layers to produce `Item`s, merge items across sources,
 * apply the top-level `sort` and `limit`, and finally derive
 * `feedOptions.updated` from the maximum item date when it was not supplied
 * statically.
 */
export async function generateFeed(config: ResolvedFeedKitConfig): Promise<Feed> {
	const siteUrl = config.feedOptions.link
	if (siteUrl === undefined) {
		throw new Error(
			'astro-feed-kit: config.feedOptions.link is required. It is used as the site URL when ' +
				'building per-item permalinks and default feed URLs.',
		)
	}

	const feed = new Feed(config.feedOptions)
	const sourceGroups = await getFeedContent(config)

	// Skip the AstroContainer (and its renderer dynamic-imports) entirely
	// when no item will carry rendered content. The `astro:content` virtual
	// module is also only needed for content rendering, so we lazy-load it
	// here.
	let container: Awaited<ReturnType<typeof createContainer>> | undefined
	let render: AstroContentRender | undefined
	if (config.includeContent) {
		// Three-layer renderer resolution:
		//   1. Explicit `renderers` input — used verbatim, no probing.
		//   2. Integration wiring — `projectRoot` was captured at
		//      `astro:config:setup` from `astroConfig.root`, Astro's
		//      canonical resolved project URL. Probing anchored there works
		//      regardless of how `astro-feed-kit` itself is installed.
		//   3. Standalone — fall back to `process.cwd()`. Brittle for
		//      exotic layouts; callers who care should pass `renderers`.
		const renderers =
			config.renderers.length > 0
				? config.renderers
				: await resolveContainerRenderers(
						config.knownRenderers,
						config.projectRoot ?? process.cwd(),
					)
		container = await createContainer(renderers)
		const astroContent = await import('astro:content')
		render = astroContent.render
	}

	// Flatten (source, entry) pairs into a single task list. The index of
	// each pair is its place in the merged-but-unsorted item order; writing
	// results back to that same index preserves deterministic ordering
	// under stable sorts, even when tasks finish out of order.
	type PendingItem = { entry: CollectionEntry<CollectionKey>; source: Source }
	const pending: PendingItem[] = []
	for (const group of sourceGroups) {
		for (const entry of group.entries) {
			pending.push({ entry, source: group.source })
		}
	}

	const items = await mapConcurrent(pending, MAX_CONCURRENCY, async ({ entry, source }) =>
		buildItem(entry, source, config, container, siteUrl, render),
	)

	const sorted = items.toSorted(config.sort)
	const limited = sorted.slice(0, config.limit)

	for (const item of limited) {
		// The `feed` library's `Item` type uses strict-optional fields
		// (`field?: T`), while the schema-inferred `Item` shape carries
		// `field?: T | undefined`. Semantically identical; cast at the
		// library boundary.
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		feed.addItem(item as Parameters<typeof feed.addItem>[0])
	}

	// Dynamic resolution: default `updated` to the newest item date when the
	// user did not supply one. Must happen before the caller serializes.
	if (feed.options.updated === undefined) {
		const latest = maxDate(limited.map((item) => item.date))
		if (latest !== undefined) {
			feed.options.updated = latest
		}
	}

	return feed
}
