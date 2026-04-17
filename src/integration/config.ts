import type { AstroRenderer } from 'astro'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { FeedOptions } from 'feed'
import type { Item } from './schemas'

/**
 * Context passed to a `CollectionConfig.link` function. Available before the
 * entry is rendered, because the derived link is used both as the item's
 * final URL and as the permalink fed to the HTML sanitizer.
 */
export type LinkContext = {
	collection: string
	siteUrl: string
}

/**
 * Context passed to an item resolver. Extends `LinkContext` with the
 * sanitized, rendered HTML of the entry — available because resolvers run
 * after the content container has produced output.
 */
export type ResolverContext = LinkContext & {
	renderedHtml: string
}

/**
 * A resolver for a single field on the feed `Item`. May be:
 *
 * - A string naming a field on `entry.data` to read directly.
 * - An object `{from, transform}` that reads `entry.data[from]` and
 *   transforms the raw value into the item field value.
 * - A function that receives the entry and resolver context and returns the
 *   item field value (or `undefined` to leave it unset).
 *
 * Resolvers may return `undefined` to signal "no value" — the field is then
 * omitted from the item.
 */
export type EntryResolver<Value> =
	| ((entry: CollectionEntry<CollectionKey>, context: ResolverContext) => undefined | Value)
	| string
	| {
			from: string
			transform: (value: unknown, context: ResolverContext) => undefined | Value
	  }

/**
 * Mapping from feed `Item` field names to their resolvers. Every field is
 * optional; unspecified fields fall through to site-wide resolvers, then to
 * built-in defaults.
 */
export type ItemResolvers = {
	[K in keyof Item]?: EntryResolver<Item[K]>
}

/**
 * Per-collection configuration. `link` is optional — when omitted, items are
 * linked at `{siteUrl}/{collection}/{entry.id}/`, matching Astro's default
 * content collection routing convention. Provide an explicit `link` to
 * customize per-entry URLs (e.g. flat slugs, dated paths, custom permalinks).
 *
 * Resolvers declared here take precedence over the top-level `resolvers`
 * field on `FeedConfigInput`.
 */
export type CollectionConfig = {
	key: string
	link?: (entry: CollectionEntry<CollectionKey>, context: LinkContext) => string
	resolvers?: ItemResolvers
}

/**
 * Where to stop when deriving an item's rendered HTML. Applied to the
 * sanitized DOM before Defuddle runs, so everything after the boundary is
 * dropped from the feed.
 *
 * - `{comment}` matches an HTML comment whose trimmed text equals `comment`
 *   (e.g. `{comment: 'excerpt'}` matches `<!-- excerpt -->`).
 * - `{selector}` matches the first element under `<body>` returned by
 *   `Document.querySelector(selector)`.
 */
export type ExcerptBoundary = { comment: string } | { selector: string }

/**
 * Filenames for each feed format, relative to the site root. Used to
 * populate `feedOptions.feedLinks` during static resolution, and exposed via
 * `getFeedPath` so manually placed routes can line up with the configured
 * names.
 */
export type FeedFilenames = {
	atom: string
	json: string
	rss: string
}

/**
 * Input shape accepted by `defineFeedConfig`. Every field except
 * `contentCollections` and `feedOptions` has a default.
 */
export type FeedConfigInput = {
	contentCollections: CollectionConfig[]
	/**
	 * Truncates each entry's rendered HTML at a marker. Defaults to
	 * `{comment: 'excerpt'}`, which matches the `<!-- excerpt -->` comment
	 * emitted by this site's `<Excerpt />` component. Pass `false` to disable
	 * truncation and publish full content.
	 */
	excerptBoundary?: ExcerptBoundary | false
	feedOptions: FeedOptions
	feeds?: Partial<FeedFilenames>
	filter?: (entry: CollectionEntry<CollectionKey>) => boolean
	/**
	 * Whether to populate each item's full HTML `content` field. Defaults to
	 * `true`. Set to `false` to publish a metadata-only feed (title,
	 * description, date, link, categories) — matches `@astrojs/rss`'s
	 * default. Skips the AstroContainer render and sanitize pipeline
	 * entirely, so resolvers reading `context.renderedHtml` will see an
	 * empty string.
	 */
	includeContent?: boolean
	/**
	 * Package names to probe for Astro renderers when `renderers` is not
	 * explicitly supplied. Each package is imported and its
	 * `getContainerRenderer()` export is called; packages that aren't
	 * installed are skipped. Defaults cover the first-party Astro renderers
	 * (`@astrojs/mdx`, `@astrojs/react`, `@astrojs/preact`, `@astrojs/svelte`,
	 * `@astrojs/vue`, `@astrojs/solid-js`, `@astrojs/lit`). Ignored entirely
	 * when `renderers` is provided.
	 */
	knownRenderers?: string[]
	/**
	 * Maximum number of items included in the generated feed, applied after
	 * sort. Defaults to `25`. Pass `Infinity` to include every eligible
	 * entry (not recommended for large archives — feed readers don't need
	 * history).
	 */
	limit?: number
	/**
	 * Explicit list of Astro renderers to load into the content-rendering
	 * container, matching the shape consumed by `loadRenderers` from
	 * `astro:container`. When supplied, `knownRenderers` probing is skipped
	 * entirely — this is the escape hatch for exotic layouts (custom
	 * resolvers, non-standard installs, monorepos) and the recommended path
	 * when calling `generateFeed` outside the integration pipeline.
	 *
	 * @example
	 *   import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx'
	 *   feedKit({ renderers: [mdxRenderer()], ... })
	 */
	renderers?: AstroRenderer[]
	resolvers?: ItemResolvers
	sort?: (a: CollectionEntry<CollectionKey>, b: CollectionEntry<CollectionKey>) => number
}

/**
 * Fully resolved feed configuration produced by `defineFeedConfig`. Defaults
 * are merged in, and static resolution has populated derivable
 * `feedOptions` fields (`id`, `feed`, `feedLinks`, `generator`) where the
 * user did not supply them.
 */
export type FeedConfig = {
	contentCollections: CollectionConfig[]
	excerptBoundary: ExcerptBoundary | false
	feedOptions: FeedOptions
	feeds: FeedFilenames
	filter?: ((entry: CollectionEntry<CollectionKey>) => boolean) | undefined
	includeContent: boolean
	knownRenderers: string[]
	limit: number
	/**
	 * Absolute filesystem path to the consumer's project root. Populated by
	 * the integration from `astroConfig.root` so endpoint-time renderer
	 * probing resolves bare specifiers against the consumer's
	 * `node_modules`, regardless of where `astro-feed-kit` itself is
	 * installed or linked. `undefined` for standalone `generateFeed`
	 * callers who bypass the integration; the probe then falls back to
	 * `process.cwd()`.
	 */
	projectRoot?: string
	/**
	 * Renderers to load into the content-rendering container. When empty,
	 * `generateFeed` probes `knownRenderers` at request time (anchored at
	 * `projectRoot` when present, `process.cwd()` otherwise). Supply this
	 * explicitly to skip probing entirely — recommended for standalone
	 * callers and for exotic install layouts.
	 */
	renderers: AstroRenderer[]
	resolvers: ItemResolvers
	sort?:
		| ((a: CollectionEntry<CollectionKey>, b: CollectionEntry<CollectionKey>) => number)
		| undefined
}

const DEFAULT_FEEDS: FeedFilenames = {
	atom: 'atom.xml',
	json: 'feed.json',
	rss: 'rss.xml',
}

const DEFAULT_LIMIT = 25

const DEFAULT_EXCERPT_BOUNDARY: ExcerptBoundary = { comment: 'excerpt' }

const DEFAULT_KNOWN_RENDERERS = [
	'@astrojs/mdx',
	'@astrojs/react',
	'@astrojs/preact',
	'@astrojs/svelte',
	'@astrojs/vue',
	'@astrojs/solid-js',
	'@astrojs/lit',
]

const DEFAULT_GENERATOR = 'feed-kit'

function joinUrl(base: string, path: string): string {
	// Using URL keeps trailing-slash and leading-slash ambiguity handled by
	// the runtime instead of ad-hoc string concatenation.
	return new URL(path, base.endsWith('/') ? base : `${base}/`).toString()
}

/**
 * Merge user input with defaults and perform static resolution on
 * `feedOptions`. Static resolution fills in fields that can be derived from
 * other configuration at build time:
 *
 * - `id` defaults to `link`
 * - `feed` defaults to `{link}/{feeds.rss}`
 * - `feedLinks.{rss,atom,json}` each default to `{link}/{feeds[kind]}`
 * - `generator` defaults to `'feed-kit'`
 *
 * `updated` is resolved dynamically inside `generateFeed` because it
 * depends on the set of eligible items.
 */
export function defineFeedConfig(input: FeedConfigInput): FeedConfig {
	const feeds: FeedFilenames = { ...DEFAULT_FEEDS, ...input.feeds }
	const knownRenderers = [...new Set([...DEFAULT_KNOWN_RENDERERS, ...(input.knownRenderers ?? [])])]

	const { feedOptions: inputFeedOptions } = input
	const siteLink = inputFeedOptions.link

	const feedLinks: NonNullable<FeedOptions['feedLinks']> = { ...inputFeedOptions.feedLinks }
	if (siteLink !== undefined) {
		feedLinks.atom ??= joinUrl(siteLink, feeds.atom)
		feedLinks.json ??= joinUrl(siteLink, feeds.json)
		feedLinks.rss ??= joinUrl(siteLink, feeds.rss)
	}

	// Build feedOptions in two phases: spread first, then conditionally
	// populate strict-optional library fields (`id`, `feed`). This avoids
	// assigning `undefined` to properties typed as `field?: T` under
	// `exactOptionalPropertyTypes`.
	const feedOptions: FeedOptions = {
		...inputFeedOptions,
		feedLinks,
		generator: inputFeedOptions.generator ?? DEFAULT_GENERATOR,
	}
	if (feedOptions.id === undefined && siteLink !== undefined) {
		feedOptions.id = siteLink
	}
	if (feedOptions.feed === undefined && siteLink !== undefined) {
		feedOptions.feed = joinUrl(siteLink, feeds.rss)
	}

	return {
		contentCollections: input.contentCollections,
		excerptBoundary: input.excerptBoundary ?? DEFAULT_EXCERPT_BOUNDARY,
		feedOptions,
		feeds,
		filter: input.filter,
		includeContent: input.includeContent ?? true,
		knownRenderers,
		limit: input.limit ?? DEFAULT_LIMIT,
		renderers: input.renderers ?? [],
		resolvers: input.resolvers ?? {},
		sort: input.sort,
	}
}

/**
 * Return the configured filename for a given feed format, with a leading
 * slash. Useful when manually placing routes that must line up with the
 * filenames declared in `feeds`.
 */
export function getFeedPath(config: FeedConfig, kind: keyof FeedFilenames): string {
	return `/${config.feeds[kind]}`
}
