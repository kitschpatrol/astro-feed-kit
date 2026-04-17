import type { AstroRenderer } from 'astro'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { FeedOptions } from 'feed'
import type { Item } from './schemas'

/**
 * Context passed to a `Source.link` function. Available before the entry is
 * rendered, because the derived link is used both as the item's final URL and
 * as the permalink fed to the HTML sanitizer.
 */
export type LinkContext = {
	collection: string
	siteUrl: string
}

/**
 * Context passed to a `Source.resolveItem` function. Extends `LinkContext` with
 * the sanitized, rendered HTML of the entry — available because resolvers run
 * after the content container has produced output.
 *
 * - `collection` — the name of the originating collection.
 * - `siteUrl` — the feed's link, used as the base for URL composition.
 * - `renderedHtml` — the entry's sanitized HTML, or `''` when `includeContent:
 *   false` was set (the render pipeline is skipped entirely in that mode).
 */
export type ItemResolverContext = LinkContext & {
	renderedHtml: string
}

/**
 * Per-entry item resolver. Called once per eligible collection entry; the
 * returned `Partial<Item>` describes the resulting feed item.
 *
 * The return value overlays the built-in defaults. Fields you set take
 * precedence; fields you omit (or return as `undefined`) fall through to the
 * baseline — they do **not** clobber it. This is the single extension point for
 * customizing feed items from collection data.
 *
 * The built-in baseline fills these fields from the entry:
 *
 * - `title` — `entry.data.title`
 * - `date`, `published` — `entry.data.date`
 * - `description` — `entry.data.description`
 * - `category` — `entry.data.tags` mapped to `{name, term}`
 * - `content` — `context.renderedHtml` (empty when `includeContent: false`)
 */
export type ItemResolver = (
	entry: CollectionEntry<CollectionKey>,
	context: ItemResolverContext,
) => Partial<Item>

/**
 * Per-source configuration. One source produces one collection's worth of feed
 * items. Every field other than `collection` is optional and narrows behavior
 * for that source only.
 *
 * The `link` default (when omitted) is `{siteUrl}/{collection}/{entry.id}/`,
 * matching Astro's default content collection routing. Provide `link` to
 * customize per-entry URLs (e.g. flat slugs, dated paths, custom permalinks).
 */
export type Source = {
	collection: string
	/** Narrows eligible entries. Composed with the built-in draft/encrypt gate. */
	filter?: (entry: CollectionEntry<CollectionKey>) => boolean
	/** Caps this source before items are merged across sources. */
	limit?: number
	/** Builds the per-entry URL for items from this source. */
	link?: (entry: CollectionEntry<CollectionKey>, context: LinkContext) => string
	/**
	 * Overrides or augments built-in item defaults for this source. Called per
	 * entry; returns a `Partial<Item>` — omitted fields fall through to the
	 * baseline resolver. See `ItemResolver` for the baseline field list.
	 */
	resolveItem?: ItemResolver
	/** Sorts this source's entries before the per-source `limit` is applied. */
	sort?: (a: CollectionEntry<CollectionKey>, b: CollectionEntry<CollectionKey>) => number
}

/**
 * User-facing source shape. A bare string is shorthand for `{ collection:
 * string }` with default behavior — convenient when no per-source customization
 * is needed.
 */
export type SourceInput = Source | string

/**
 * Where to stop when deriving an item's rendered HTML. Applied to the sanitized
 * DOM before Defuddle runs, so everything after the boundary is dropped from
 * the feed.
 *
 * - `{comment}` matches an HTML comment whose trimmed text equals `comment` (e.g.
 *   `{comment: 'excerpt'}` matches `<!-- excerpt -->`).
 * - `{selector}` matches the first element under `<body>` returned by
 *   `Document.querySelector(selector)`.
 */
export type ExcerptBoundary = { comment: string } | { selector: string }

/**
 * Filenames for each feed format, relative to the site root. Used to populate
 * `feedOptions.feedLinks` during static resolution, and exposed via
 * `getFeedPath` so manually placed routes can line up with the configured
 * names.
 */
export type FormatFilenames = {
	atom: string
	json: string
	rss: string
}

/**
 * Input shape for `formats`. Each format accepts:
 *
 * - `undefined` / omitted — enabled with the default filename.
 * - `true` — enabled with the default filename (explicit form).
 * - `false` — disabled; no route is injected and no `<link rel="alternate">` is
 *   emitted for this format.
 * - A string — enabled with a custom filename (relative to the site root).
 */
export type FormatsInput = Partial<Record<keyof FormatFilenames, boolean | string>>

/**
 * User-facing configuration for the `feedKit` integration and for standalone
 * `generateFeed` callers via `defineFeedKitConfig`. Every field except
 * `sources` and `feedOptions` has a default.
 */
export type FeedKitConfig = {
	/**
	 * Truncates each entry's rendered HTML at a marker. Defaults to `{comment:
	 * 'excerpt'}`, which matches the `<!-- excerpt -->` comment emitted by this
	 * site's `<Excerpt />` component. Pass `false` to disable truncation and
	 * publish full content.
	 */
	excerptBoundary?: ExcerptBoundary | false
	/**
	 * Feed-level metadata passed to the underlying `feed` library. Two fields are
	 * deliberately excluded:
	 *
	 * - `feedLinks` — the per-format self-advertisement URLs written into each feed
	 *   document. Always derived from `formats` + `link` at resolution time;
	 *   setting it manually used to silently conflict with the route mount
	 *   paths.
	 * - `feed` — the RSS "where does this feed live" self-reference. 100% redundant
	 *   with `feedLinks.rss`; also derived.
	 *
	 * If you need to advertise feeds at a different origin (e.g. a CDN), open an
	 * issue — we'll add a first-class option rather than reopen this foot-gun.
	 */
	feedOptions: Omit<FeedOptions, 'feed' | 'feedLinks'>
	/**
	 * Per-format filename overrides and enable/disable flags. Pass `false` to
	 * disable a format entirely (no route injected, no `<link>` tag rendered, no
	 * entry in `feedOptions.feedLinks`). Pass `true` or omit to enable with the
	 * default filename. Pass a string to enable with a custom filename.
	 */
	formats?: FormatsInput
	/**
	 * Whether to populate each item's full HTML `content` field. Defaults to
	 * `true`. Set to `false` to publish a metadata-only feed (title, description,
	 * date, link, categories) — matches `@astrojs/rss`'s default. Skips the
	 * AstroContainer render and sanitize pipeline entirely, so resolvers reading
	 * `context.renderedHtml` will see an empty string.
	 */
	includeContent?: boolean
	/**
	 * Package names to probe for Astro renderers when `renderers` is not
	 * explicitly supplied. Each package is imported and its
	 * `getContainerRenderer()` export is called; packages that aren't installed
	 * are skipped. Defaults cover the first-party Astro renderers
	 * (`@astrojs/mdx`, `@astrojs/react`, `@astrojs/preact`, `@astrojs/svelte`,
	 * `@astrojs/vue`, `@astrojs/solid-js`, `@astrojs/lit`). Ignored entirely when
	 * `renderers` is provided.
	 */
	knownRenderers?: string[]
	/**
	 * Maximum number of items in the merged feed, applied after the final `sort`.
	 * Defaults to `25`. Pass `Infinity` to include every eligible item (not
	 * recommended for large archives — feed readers don't need history).
	 */
	limit?: number
	/**
	 * Explicit list of Astro renderers to load into the content-rendering
	 * container, matching the shape consumed by `loadRenderers` from
	 * `astro:container`. When supplied, `knownRenderers` probing is skipped
	 * entirely — this is the escape hatch for exotic layouts (custom resolvers,
	 * non-standard installs, monorepos) and the recommended path when calling
	 * `generateFeed` outside the integration pipeline.
	 *
	 * @example
	 * 	import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx'
	 * 	feedKit({ renderers: [mdxRenderer()], ... })
	 */
	renderers?: AstroRenderer[]
	/**
	 * Orders the merged item set across all sources. Operates on resolved `Item`
	 * shape — fields are uniform regardless of source collection. Defaults to
	 * newest `date` first.
	 */
	sort?: (a: Item, b: Item) => number
	sources: SourceInput[]
}

/**
 * Fully resolved feed configuration produced by `defineFeedKitConfig`. Defaults
 * are merged in, and static resolution has populated derivable `feedOptions`
 * fields (`id`, `feed`, `feedLinks`, `generator`) where the user did not supply
 * them.
 */
export type ResolvedFeedKitConfig = {
	excerptBoundary: ExcerptBoundary | false
	feedOptions: FeedOptions
	/**
	 * Resolved filenames for enabled formats. A format absent from this record
	 * has been disabled (`formats: { [kind]: false }`) — no route is injected and
	 * no `<link>` is emitted for it.
	 */
	formats: Partial<FormatFilenames>
	includeContent: boolean
	knownRenderers: string[]
	limit: number
	/**
	 * Absolute filesystem path to the consumer's project root. Populated by the
	 * integration from `astroConfig.root` so endpoint-time renderer probing
	 * resolves bare specifiers against the consumer's `node_modules`, regardless
	 * of where `astro-feed-kit` itself is installed or linked. `undefined` for
	 * standalone `generateFeed` callers who bypass the integration; the probe
	 * then falls back to `process.cwd()`.
	 */
	projectRoot?: string
	/**
	 * Renderers to load into the content-rendering container. When empty,
	 * `generateFeed` probes `knownRenderers` at request time (anchored at
	 * `projectRoot` when present, `process.cwd()` otherwise). Supply this
	 * explicitly to skip probing entirely — recommended for standalone callers
	 * and for exotic install layouts.
	 */
	renderers: AstroRenderer[]
	sort: (a: Item, b: Item) => number
	sources: Source[]
}

const DEFAULT_FORMATS: FormatFilenames = {
	atom: 'atom.xml',
	json: 'feed.json',
	rss: 'rss.xml',
}

const FORMAT_KINDS = ['atom', 'json', 'rss'] as const satisfies ReadonlyArray<keyof FormatFilenames>

/**
 * Resolve one user-supplied `formats` entry. `undefined` and `true` enable the
 * format with its default filename; `false` disables it; a string enables it
 * with the custom filename.
 */
function resolveFormatEntry(
	value: boolean | string | undefined,
	defaultName: string,
): string | undefined {
	if (value === false) return undefined
	if (value === undefined || value === true) return defaultName
	return value
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

/**
 * Default merged-item sort: newest `Item.date` first.
 */
export function defaultItemSort(a: Item, b: Item): number {
	return b.date.getTime() - a.date.getTime()
}

/**
 * Normalize one entry in the user-facing `sources` array. A bare string is
 * expanded to `{ collection: string }`; objects pass through unchanged.
 */
function normalizeSource(input: SourceInput): Source {
	if (typeof input === 'string') return { collection: input }
	return input
}

function joinUrl(base: string, path: string): string {
	// Using URL keeps trailing-slash and leading-slash ambiguity handled by
	// the runtime instead of ad-hoc string concatenation.
	return new URL(path, base.endsWith('/') ? base : `${base}/`).toString()
}

/**
 * Merge user input with defaults and perform static resolution on
 * `feedOptions`. When `siteLink` is present, the following fields are derived
 * unconditionally — user input for them is forbidden at the type level (see
 * `FeedKitConfig`):
 *
 * - `feedLinks.{rss,atom,json}` — `{link}/{formats[kind]}`
 * - `feed` — `{link}/{formats.rss}`
 *
 * `id` defaults to `link` only when the user did not supply it.
 *
 * `updated` is resolved dynamically inside `generateFeed` because it depends on
 * the set of eligible items.
 */
export function defineFeedKitConfig(input: FeedKitConfig): ResolvedFeedKitConfig {
	const formats: Partial<FormatFilenames> = {}
	for (const kind of FORMAT_KINDS) {
		const filename = resolveFormatEntry(input.formats?.[kind], DEFAULT_FORMATS[kind])
		if (filename !== undefined) formats[kind] = filename
	}
	const knownRenderers = [...new Set([...DEFAULT_KNOWN_RENDERERS, ...(input.knownRenderers ?? [])])]

	const { feedOptions: inputFeedOptions } = input
	const siteLink = inputFeedOptions.link

	// Build feedOptions: spread user input (which by type can't include
	// `feed` or `feedLinks`), then layer in derived fields only when we
	// have the `siteLink` they depend on. This avoids writing `undefined`
	// into strict-optional library properties under
	// `exactOptionalPropertyTypes`. `feedLinks` and the rss self-reference
	// `feed` only include enabled formats.
	const feedOptions: FeedOptions = { ...inputFeedOptions }
	if (siteLink !== undefined) {
		const feedLinks: Partial<FormatFilenames> = {}
		for (const kind of FORMAT_KINDS) {
			const filename = formats[kind]
			if (filename !== undefined) feedLinks[kind] = joinUrl(siteLink, filename)
		}
		feedOptions.feedLinks = feedLinks
		if (formats.rss !== undefined) feedOptions.feed = joinUrl(siteLink, formats.rss)
		feedOptions.id ??= siteLink
	}

	return {
		excerptBoundary: input.excerptBoundary ?? DEFAULT_EXCERPT_BOUNDARY,
		feedOptions,
		formats,
		includeContent: input.includeContent ?? true,
		knownRenderers,
		limit: input.limit ?? DEFAULT_LIMIT,
		renderers: input.renderers ?? [],
		sort: input.sort ?? defaultItemSort,
		sources: input.sources.map((source) => normalizeSource(source)),
	}
}

/**
 * Return the configured filename for a given feed format, with a leading slash.
 * Returns `undefined` when the format has been disabled (`formats: { [kind]:
 * false }`). Useful when manually placing routes that must line up with the
 * filenames declared in `formats`, and for guarding `<link rel="alternate">`
 * tags on disabled formats.
 */
export function getFeedPath(
	config: ResolvedFeedKitConfig,
	kind: keyof FormatFilenames,
): string | undefined {
	const filename = config.formats[kind]
	return filename === undefined ? undefined : `/${filename}`
}
