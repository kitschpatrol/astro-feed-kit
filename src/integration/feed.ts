import type { CollectionEntry, CollectionKey } from 'astro:content'
import { render } from 'astro:content'
import { Feed } from 'feed'
import type { FeedConfig, LinkContext, ResolverContext } from './config'
import type { Item } from './schemas'
import { getFeedContent } from './collection'
import { createContainer } from './container'
import { applyResolvers } from './item-map'
import { sanitizeHtml } from './sanitize'
import { ItemSchema } from './schemas'

function findCollectionConfig(config: FeedConfig, collectionKey: string) {
	const match = config.contentCollections.find((c) => c.key === collectionKey)
	if (match === undefined) {
		throw new Error(
			`No CollectionConfig registered for collection '${collectionKey}'. ` +
				`Add it to contentCollections or filter the entry out via config.filter.`,
		)
	}
	return match
}

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
 * sanitize its HTML (skipped when `config.includeContent` is `false`), then run
 * the resolver chain to build an `Item`.
 *
 * `container` may be `undefined` when content is excluded — there's nothing to
 * render, and `createContainer` is bypassed up the call chain to avoid its
 * dynamic-import cost entirely.
 */
async function buildItem(
	entry: CollectionEntry<CollectionKey>,
	config: FeedConfig,
	container: Awaited<ReturnType<typeof createContainer>> | undefined,
	siteUrl: string,
): Promise<Item> {
	const collectionConfig = findCollectionConfig(config, entry.collection)

	const linkContext: LinkContext = {
		collection: entry.collection,
		siteUrl,
	}
	const link = collectionConfig.link(entry, linkContext)

	let renderedHtml = ''
	if (container !== undefined) {
		const { Content } = await render(entry)
		const rawHtml = await container.renderToString(Content)
		renderedHtml = await sanitizeHtml(rawHtml, link, config.excerptBoundary)
	}

	const resolverContext: ResolverContext = { ...linkContext, renderedHtml }
	const partial = applyResolvers(entry, collectionConfig, config.resolvers, resolverContext)

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
 * Steps: load and validate eligible entries, build an Astro container for the
 * configured renderers, render and sanitize each entry's HTML, run the resolver
 * chain to produce `Item`s, and finally derive `feedOptions.updated` from the
 * maximum item date when it was not supplied statically.
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
	const entries = await getFeedContent(config)
	// Skip the AstroContainer (and its renderer dynamic-imports) entirely
	// when no item will carry rendered content. Resolvers that depend on
	// `context.renderedHtml` will see an empty string in this mode.
	const container = config.includeContent ? await createContainer(config.knownRenderers) : undefined

	const itemDates: Date[] = []
	for (const entry of entries) {
		const item = await buildItem(entry, config, container, siteUrl)
		// The `feed` library's `Item` type uses strict-optional fields
		// (`field?: T`), while the schema-inferred `Item` shape carries
		// `field?: T | undefined`. Semantically identical; cast at the
		// library boundary.
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		feed.addItem(item as Parameters<typeof feed.addItem>[0])
		itemDates.push(item.date)
	}

	// Dynamic resolution: default `updated` to the newest item date when the
	// user did not supply one. Must happen before the caller serializes.
	if (feed.options.updated === undefined) {
		const latest = maxDate(itemDates)
		if (latest !== undefined) feed.options.updated = latest
	}

	return feed
}
