import type * as AstroContent from 'astro:content'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import { Feed } from 'feed'
import type { FeedConfig, LinkContext, ResolverContext, Source } from './config'
import type { Item } from './schemas'
import { getFeedContent } from './collection'
import { createContainer, resolveContainerRenderers } from './container'
import { resolveItem } from './item-map'
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
 * Render a single entry through the pipeline: derive its link, render and
 * sanitize its HTML (skipped when `config.includeContent` is `false`), then
 * run the resolver layers to build an `Item`.
 *
 * `container` may be `undefined` when content is excluded — there's nothing to
 * render, and `createContainer` is bypassed up the call chain to avoid its
 * dynamic-import cost entirely.
 */
async function buildItem(
	entry: CollectionEntry<CollectionKey>,
	source: Source,
	config: FeedConfig,
	container: Awaited<ReturnType<typeof createContainer>> | undefined,
	siteUrl: string,
	render: AstroContentRender | undefined,
): Promise<Item> {
	const linkContext: LinkContext = {
		collection: entry.collection,
		siteUrl,
	}
	const link =
		source.link?.(entry, linkContext) ??
		new URL(
			`${entry.collection}/${entry.id}/`,
			siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
		).toString()

	let renderedHtml = ''
	if (container !== undefined && render !== undefined) {
		const { Content } = await render(entry)
		const rawHtml = await container.renderToString(Content)
		renderedHtml = await sanitizeHtml(rawHtml, link, config.excerptBoundary)
	}

	const resolverContext: ResolverContext = { ...linkContext, renderedHtml }
	const partial = resolveItem(entry, resolverContext, source.resolve)

	const assembled: Record<string, unknown> = {
		...partial,
		id: partial.id ?? link,
		link,
	}
	// `includeContent: false` is authoritative — drop any `content` a custom
	// resolver may have produced so the field is omitted from the feed.
	if (!config.includeContent) {
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
 * Generate a populated `Feed` instance from a resolved `FeedConfig`. The
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
export async function generateFeed(config: FeedConfig): Promise<Feed> {
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
	// when no item will carry rendered content. Resolvers that depend on
	// `context.renderedHtml` will see an empty string in this mode. The
	// `astro:content` virtual module is also only needed for content
	// rendering, so we lazy-load it here.
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
