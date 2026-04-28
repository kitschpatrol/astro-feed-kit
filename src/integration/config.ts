import type { AstroRenderer } from 'astro'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { FeedOptions } from 'feed'
import type { Item } from './schemas'

/**
 * Arguments passed to an `ItemResolver`. The resolver runs before the entry is
 * rendered, so `renderedHtml` is intentionally not exposed — the pipeline fills
 * `content` from the sanitized render after the resolver returns.
 *
 * `C` narrows `entry` to the collection named on the enclosing `Source`. When
 * used without a type argument — as internal consumers do — `entry` widens to
 * `CollectionEntry<CollectionKey>`.
 */
export type ItemResolverArgs<C extends CollectionKey = CollectionKey> = {
	entry: CollectionEntry<C>
	siteUrl: string
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
 * The built-in baseline fills these fields:
 *
 * - `title` — `entry.data.title`
 * - `date`, `published` — `entry.data.date`
 * - `description` — `entry.data.description`
 * - `category` — `entry.data.tags` mapped to `{name, term}`
 * - `link` — `{siteUrl}/{entry.collection}/{entry.id}/` (override to customize
 *   per-entry URLs)
 *
 * `content` is **not** set by the resolver — it's filled in by the pipeline
 * from the sanitized rendered HTML after the resolver runs. Return an explicit
 * `content: string` to override it; the override wins unless `includeContent:
 * false` is set (which drops content entirely).
 */
export type ItemResolver<C extends CollectionKey = CollectionKey> = (
	args: ItemResolverArgs<C>,
) => Partial<Item>

/**
 * Per-source configuration. One source produces one collection's worth of feed
 * items. Every field other than `collection` is optional and narrows behavior
 * for that source only.
 *
 * `C` is the collection name. Supplying a literal (e.g. `Source<'posts'>`)
 * narrows `filter`, `sort`, and `resolveItem`'s `entry` to that collection's
 * `CollectionEntry`. `SourceInput` drives this inference automatically from the
 * `collection` discriminant, so most users never spell `C` out.
 */
export type Source<C extends CollectionKey = CollectionKey> = {
	collection: C
	/** Narrows eligible entries. Composed with the built-in `draft: true` gate. */
	filter?: (entry: CollectionEntry<C>) => boolean
	/** Caps this source before items are merged across sources. */
	limit?: number
	/**
	 * Overrides or augments built-in item defaults for this source. Called per
	 * entry; returns a `Partial<Item>` — omitted fields fall through to the
	 * baseline resolver. See `ItemResolver` for the baseline field list,
	 * including the `link` default of `{siteUrl}/{collection}/{entry.id}/`.
	 */
	resolveItem?: ItemResolver<C>
	/** Sorts this source's entries before the per-source `limit` is applied. */
	sort?: (a: CollectionEntry<C>, b: CollectionEntry<C>) => number
}

/**
 * User-facing source shape. A bare string is shorthand for `{ collection:
 * string }` with default behavior — convenient when no per-source customization
 * is needed.
 *
 * The object form is a distributed union over `CollectionKey`, so writing `{
 * collection: 'posts', resolveItem({ entry }) { ... } }` narrows `entry` to
 * `CollectionEntry<'posts'>` via the `collection` discriminant.
 */
export type SourceInput = string | { [C in CollectionKey]: Source<C> }[CollectionKey]

/**
 * Where to stop when deriving an item's rendered HTML. Applied to the sanitized
 * DOM before Defuddle runs, so everything after the boundary is dropped from
 * the feed.
 *
 * - `{comment}` matches an HTML comment whose trimmed text equals `comment` (e.g.
 *   `{comment: 'excerpt'}` matches `<!-- excerpt -->`).
 * - `{selector}` matches the first element under `<body>` returned by
 *   `Document.querySelector(selector)`.
 * - `{readMore}` optionally appends a "Continue reading..." link pointing to the
 *   entry's permalink after truncation. Pass `true` for the default text, or a
 *   string to customize it.
 */
export type ExcerptBoundary =
	| { comment: string; readMore?: boolean | string }
	| { readMore?: boolean | string; selector: string }

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
	 * Truncates each entry's rendered HTML at a marker. Defaults to `false` (full
	 * content). Pass an `ExcerptBoundary` object to enable truncation, optionally
	 * with a `readMore` link appended after the cut.
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
	 * AstroContainer render and sanitize pipeline entirely; any `content`
	 * returned from a `resolveItem` is dropped in this mode.
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
	if (value === false) {
		return undefined
	}

	if (value === undefined || value === true) {
		return defaultName
	}

	return value
}

const DEFAULT_LIMIT = 25

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
 *
 * The object branch widens a narrow `Source<'posts'>` into
 * `Source<CollectionKey>`. TS won't accept this directly because the function
 * members (`filter`, `sort`, `resolveItem`) are contravariant in their entry
 * parameter, but the pipeline only ever invokes those functions with entries
 * from the matching collection, so the widening is sound at runtime.
 */
function normalizeSource(input: SourceInput): Source {
	if (typeof input === 'string') {
		// `CollectionKey` is a compile-time union of declared collection names;
		// at runtime it's just `string`. Mirrors the cast at the `getCollection`
		// call site in `collection.ts`.
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		return { collection: input as CollectionKey }
	}

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
		if (filename !== undefined) {
			formats[kind] = filename
		}
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
			if (filename !== undefined) {
				feedLinks[kind] = joinUrl(siteLink, filename)
			}
		}

		feedOptions.feedLinks = feedLinks
		if (formats.rss !== undefined) {
			feedOptions.feed = joinUrl(siteLink, formats.rss)
		}

		feedOptions.id ??= siteLink
	}

	return {
		excerptBoundary: input.excerptBoundary ?? false,
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
