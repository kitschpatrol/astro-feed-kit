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
 * `astro:content` is a Vite virtual module — it only resolves inside code
 * that runs through Vite's module graph. We dynamically import it at call
 * time so the package's barrel can be loaded from `astro.config.ts` (where
 * Vite is not yet active) without crashing.
 */
type AstroContentRender = typeof AstroContent.render

function maxDate(dates: Date[]): Date | undefined {
	if (dates.length === 0) return undefined
	let max = dates[0]!
	for (const date of dates) {
		if (date.getTime() > max.getTime()) max = date
	}
	return max
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
			`feed-kit: resolveItem returned link: undefined for ${entry.collection}/${entry.id}. ` +
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
			'feed-kit: config.feedOptions.link is required. It is used as the site URL when ' +
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

	const items: Item[] = []
	for (const group of sourceGroups) {
		for (const entry of group.entries) {
			const item = await buildItem(entry, group.source, config, container, siteUrl, render)
			items.push(item)
		}
	}

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
		if (latest !== undefined) feed.options.updated = latest
	}

	return feed
}
