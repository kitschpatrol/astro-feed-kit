import type { AstroConfig, AstroRenderer } from 'astro'
import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { FeedOptions } from 'feed'
import type { AstroI18nOptions, LocaleInfo } from './locale'
import type { Item } from './schemas'
import { defaultLocale, entryLocale, findLocale, resolveLocales } from './locale'
import { assertLanguageTag } from './serialize'

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
	/**
	 * The code of the locale whose feed is being built, such as `fr`. Only set
	 * when `i18n` is enabled.
	 */
	locale?: string | undefined
	/**
	 * The root URL pages live under: `feedOptions.link`, which defaults to
	 * Astro's `site` joined with `base`, plus the locale's URL prefix (`fr/`)
	 * when `i18n` is enabled. Always ends with `/`, so relative paths can be
	 * resolved against it directly with `new URL(path, siteUrl)`.
	 */
	siteUrl: string
	/**
	 * `entry.id` without its locale folder: `fr/hello` becomes `hello`. Equal to
	 * `entry.id` when `i18n` is off or the id has no locale folder.
	 */
	slug: string
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
 * - `link` — `{siteUrl}{entry.collection}/{slug}/`, with the trailing slash
 *   following Astro's `trailingSlash` and `build.format` (override to customize
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
	 * including the `link` default of `{siteUrl}{collection}/{slug}/`.
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
 * A value that may differ per locale. With `i18n: true`, pass a function to
 * receive each locale's code and return that locale's value. Without `i18n`,
 * only the plain value is accepted.
 */
export type Localizable<T> = ((locale: string) => T) | T

/**
 * Astro project settings that decide where pages and feeds are served. The
 * integration reads them from the Astro config. Standalone
 * `defineFeedKitConfig` callers can pass the same values to match their
 * project. Every field is optional and falls back to Astro's default.
 */
export type AstroSiteOptions = {
	/**
	 * Astro's `base`. Prefixes the feed paths and the default site URL. Defaults
	 * to `/`.
	 */
	base?: string | undefined
	/**
	 * Astro's `build.format`. Decides whether default item links end with `/`
	 * when `trailingSlash` is `'ignore'`. Defaults to `'directory'`.
	 */
	buildFormat?: AstroConfig['build']['format'] | undefined
	/**
	 * Astro's `i18n`. Read when `FeedKitConfig.i18n` is `true` to decide which
	 * locales get a feed and where each one is served.
	 */
	i18n?: AstroI18nOptions | undefined
	/**
	 * Astro's `site`. Joined with `base` to form the default `feedOptions.link`.
	 */
	site?: string | undefined
	/**
	 * Astro's `trailingSlash`. Decides whether default item links end with `/`.
	 * Defaults to `'ignore'`.
	 */
	trailingSlash?: AstroConfig['trailingSlash'] | undefined
}

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
	 * with a `readMore` link appended after the cut. With `i18n: true`, a
	 * function of the locale code can localize the `readMore` text.
	 */
	excerptBoundary?: Localizable<ExcerptBoundary | false>
	/**
	 * Feed-level metadata passed to the underlying `feed` library. `link` is the
	 * site root URL: it defaults to Astro's `site` joined with `base`, and is
	 * normalized to end with `/`. If you set it yourself, include your `base`
	 * path. With `i18n: true`, a function of the locale code can localize `title`
	 * and `description`; each locale's `link` gets its URL prefix, and `language`
	 * defaults to the locale's code. Two fields are deliberately excluded:
	 *
	 * - `feedLinks` — the per-format self-advertisement URLs written into each feed
	 *   document. Always derived from `formats` + `link` at resolution time;
	 *   setting it manually used to silently conflict with the route mount
	 *   paths.
	 * - `feed` — the `feed` library writes it as the self link of every format,
	 *   ahead of `feedLinks`, so a single value would mislabel the other formats.
	 *   Each format's self link comes from `feedLinks` instead.
	 *
	 * If you need to advertise feeds at a different origin (e.g. a CDN), open an
	 * issue — we'll add a first-class option rather than reopen this foot-gun.
	 */
	feedOptions: Localizable<Omit<FeedOptions, 'feed' | 'feedLinks'>>
	/**
	 * Per-format filename overrides and enable/disable flags. Pass `false` to
	 * disable a format entirely (no route injected, no `<link>` tag rendered, no
	 * entry in `feedOptions.feedLinks`). Pass `true` or omit to enable with the
	 * default filename. Pass a string to enable with a custom filename.
	 */
	formats?: FormatsInput
	/**
	 * Publish one feed per locale of an Astro `i18n` site. Each locale's feeds
	 * are served under its URL prefix (`/rss.xml` for an unprefixed default
	 * locale, `/fr/rss.xml` for `fr`), contain only entries from its content
	 * folder (`src/content/posts/fr/`), and link to pages under that prefix.
	 * Entries outside any locale folder belong to the default locale. Defaults to
	 * `false`. Requires Astro's `i18n` config.
	 */
	i18n?: boolean
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
	 * explicitly supplied. Each package's `<pkg>/container-renderer` entrypoint
	 * (falling back to the package root) is imported and its
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
	 * 	import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer'
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
 * A locale together with the feed settings resolved for it: that locale's
 * `feedOptions` (with its own `link`, `id`, `feedLinks`, and `language`) and
 * `excerptBoundary`.
 */
export type ResolvedLocale = LocaleInfo & {
	excerptBoundary: ExcerptBoundary | false
	feedOptions: FeedOptions
}

/**
 * Fully resolved feed configuration produced by `defineFeedKitConfig`. Defaults
 * are merged in, and static resolution has populated the derivable
 * `feedOptions` fields (`link`, `id`, `feedLinks`) where the user did not
 * supply them. With `i18n`, `feedOptions` and `excerptBoundary` describe the
 * locale in `locale`, which starts out as the default locale; `localizeConfig`
 * switches to another.
 */
export type ResolvedFeedKitConfig = {
	/**
	 * Whether default item links end with `/`. Follows Astro's own rule: always
	 * for `trailingSlash: 'always'`, never for `'never'`, and for `'ignore'` only
	 * when `build.format` is `'directory'`.
	 */
	appendTrailingSlash: boolean
	/**
	 * Astro's `base`, normalized to start and end with `/`. Prefixes the paths
	 * returned by `getFeedPath`.
	 */
	base: string
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
	 * The locale this config describes. Set only with `i18n`: the default locale
	 * after `defineFeedKitConfig`, or whichever locale `localizeConfig` picked.
	 */
	locale?: ResolvedLocale
	/** Every locale of the site, in Astro's order. Set only with `i18n`. */
	locales?: ResolvedLocale[]
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

/** Every feed format, in the order routes are injected and logged. */
export const FORMAT_KINDS = ['atom', 'json', 'rss'] as const satisfies ReadonlyArray<
	keyof FormatFilenames
>

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

	return value === undefined || value === true ? defaultName : value
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
	// `CollectionKey` is a compile-time union of declared collection names;
	// at runtime it's just `string`. Mirrors the cast at the `getCollection`
	// call site in `collection.ts`.
	return typeof input === 'string' ? { collection: input as CollectionKey } : input
}

function joinUrl(base: string, path: string): string {
	// Using URL keeps trailing-slash and leading-slash ambiguity handled by
	// the runtime instead of ad-hoc string concatenation.
	return new URL(path, base.endsWith('/') ? base : `${base}/`).href
}

const EDGE_SLASHES = /^\/+|\/+$/gv

/** Normalize an Astro `base` to start and end with `/` (`/` for the root). */
function normalizeBase(base: string): string {
	const trimmed = base.replaceAll(EDGE_SLASHES, '')
	return trimmed === '' ? '/' : `/${trimmed}/`
}

/**
 * The root URL pages live under, with a trailing slash: the explicit
 * `feedOptions.link` when given, otherwise Astro's `site` joined with `base`;
 * either way followed by the locale's URL `prefix` (`''` or `fr/`).
 */
function resolveSiteLink(
	explicitLink: string | undefined,
	site: string | undefined,
	base: string,
	prefix: string,
): string | undefined {
	if (explicitLink !== undefined) {
		return joinUrl(explicitLink, prefix)
	}

	return site === undefined ? undefined : joinUrl(site, base.slice(1) + prefix)
}

/** Astro's rule for whether page URLs end with `/`. */
function resolveAppendTrailingSlash(
	trailingSlash: AstroConfig['trailingSlash'],
	buildFormat: AstroConfig['build']['format'],
): boolean {
	return trailingSlash === 'ignore' ? buildFormat === 'directory' : trailingSlash === 'always'
}

/**
 * Resolve a `Localizable` for one locale. Plain values pass through. A function
 * needs a locale to be called with, so without `i18n` it is an error.
 */
function resolveLocalizable<T>(
	value: Localizable<T>,
	locale: string | undefined,
	field: string,
): T {
	if (typeof value !== 'function') {
		return value
	}

	if (locale === undefined) {
		throw new Error(
			`astro-feed-kit: ${field} is a function, which needs \`i18n: true\` so there is a locale to pass it.`,
		)
	}

	// `typeof` narrowed out the plain `T` branch; what is left is the function form.
	return (value as (locale: string) => T)(locale)
}

/**
 * Build one feed's `FeedOptions`: spread the user's input (which by type can't
 * include `feed` or `feedLinks`), then layer in derived fields only when the
 * `siteLink` they depend on is known. This avoids writing `undefined` into
 * strict-optional library properties under `exactOptionalPropertyTypes`.
 * `feedLinks` only includes enabled formats.
 */
function buildFeedOptions(
	inputFeedOptions: Omit<FeedOptions, 'feed' | 'feedLinks'>,
	siteLink: string | undefined,
	formats: Partial<FormatFilenames>,
): FeedOptions {
	const feedOptions: FeedOptions = { ...inputFeedOptions }
	if (feedOptions.language !== undefined) {
		assertLanguageTag(feedOptions.language)
	}

	if (siteLink !== undefined) {
		feedOptions.link = siteLink
		const feedLinks: Partial<FormatFilenames> = {}
		for (const kind of FORMAT_KINDS) {
			const filename = formats[kind]
			if (filename !== undefined) {
				feedLinks[kind] = joinUrl(siteLink, filename)
			}
		}

		feedOptions.feedLinks = feedLinks
		feedOptions.id ??= siteLink
	}

	return feedOptions
}

/**
 * Merge user input with defaults and perform static resolution on
 * `feedOptions`.
 *
 * `astro` carries the Astro project settings that decide where things are
 * served. The integration passes them automatically; standalone callers can
 * supply them to match their project.
 *
 * `link` defaults to Astro's `site` joined with `base`, and is normalized to
 * end with `/`. When a link is available, `feedLinks.{rss,atom,json}` is
 * derived unconditionally as `{link}{formats[kind]}` for each enabled format.
 * User input for `feedLinks` and `feed` is forbidden at the type level (see
 * `FeedKitConfig`), and `feed` is left unset so each format's self link comes
 * from its own `feedLinks` entry.
 *
 * `id` defaults to `link` only when the user did not supply it.
 *
 * With `i18n: true`, `feedOptions` and `excerptBoundary` are resolved once per
 * locale from `astro.i18n`: each locale's `link` carries its URL prefix,
 * `language` defaults to its code, and the results are kept in `locales`. The
 * returned config describes the default locale; see `localizeConfig`.
 *
 * `updated` is resolved dynamically inside `generateFeed` because it depends on
 * the set of eligible items.
 */
export function defineFeedKitConfig(
	input: FeedKitConfig,
	astro: AstroSiteOptions = {},
): ResolvedFeedKitConfig {
	const formats: Partial<FormatFilenames> = {}
	for (const kind of FORMAT_KINDS) {
		const filename = resolveFormatEntry(input.formats?.[kind], DEFAULT_FORMATS[kind])
		if (filename !== undefined) {
			formats[kind] = filename
		}
	}

	const knownRenderers = [...new Set([...DEFAULT_KNOWN_RENDERERS, ...(input.knownRenderers ?? [])])]
	const base = normalizeBase(astro.base ?? '/')

	const common = {
		appendTrailingSlash: resolveAppendTrailingSlash(
			astro.trailingSlash ?? 'ignore',
			astro.buildFormat ?? 'directory',
		),
		base,
		formats,
		includeContent: input.includeContent ?? true,
		knownRenderers,
		limit: input.limit ?? DEFAULT_LIMIT,
		renderers: input.renderers ?? [],
		sort: input.sort ?? defaultItemSort,
		sources: input.sources.map((source) => normalizeSource(source)),
	}

	function resolveFeedSettings(locale: LocaleInfo | undefined) {
		const code = locale?.code
		const inputFeedOptions = resolveLocalizable(input.feedOptions, code, 'feedOptions')
		const siteLink = resolveSiteLink(inputFeedOptions.link, astro.site, base, locale?.prefix ?? '')
		const feedOptions = buildFeedOptions(inputFeedOptions, siteLink, formats)
		const excerptBoundary =
			input.excerptBoundary === undefined
				? false
				: resolveLocalizable(input.excerptBoundary, code, 'excerptBoundary')
		return { excerptBoundary, feedOptions }
	}

	if (input.i18n !== true) {
		return { ...common, ...resolveFeedSettings(undefined) }
	}

	if (astro.i18n === undefined) {
		throw new Error(
			"astro-feed-kit: `i18n: true` needs Astro's `i18n` config (`defaultLocale` and `locales`), " +
				'which is not set.',
		)
	}

	const locales = resolveLocales(astro.i18n).map((locale): ResolvedLocale => {
		const settings = resolveFeedSettings(locale)
		// Astro allows underscores in locale codes, but a language tag uses hyphens.
		settings.feedOptions.language ??= locale.code.replaceAll('_', '-')
		assertLanguageTag(settings.feedOptions.language)
		return { ...locale, ...settings }
	})

	const initial = defaultLocale(locales)
	return {
		...common,
		excerptBoundary: initial.excerptBoundary,
		feedOptions: initial.feedOptions,
		locale: initial,
		locales,
	}
}

/**
 * The same config described for another locale: `feedOptions`,
 * `excerptBoundary`, and `locale` switch to the locale named by `locale`, which
 * may be any of its codes or its path. `undefined` selects the default locale.
 * Without `i18n` the config is returned unchanged.
 */
export function localizeConfig(
	config: ResolvedFeedKitConfig,
	locale?: string,
): ResolvedFeedKitConfig {
	const { locales } = config
	if (locales === undefined) {
		return config
	}

	const target = locale === undefined ? defaultLocale(locales) : findLocale(locales, locale)
	if (target === undefined) {
		throw new Error(
			`astro-feed-kit: unknown locale ${JSON.stringify(locale)}. Configured locales: ` +
				`${locales.map((candidate) => candidate.code).join(', ')}.`,
		)
	}

	return {
		...config,
		excerptBoundary: target.excerptBoundary,
		feedOptions: target.feedOptions,
		locale: target,
	}
}

/**
 * `entry.id` without its locale folder, for the locales in `config`. Equal to
 * the id when `i18n` is off or the id has no locale folder.
 */
export function entrySlug(config: ResolvedFeedKitConfig, id: string): string {
	return config.locales === undefined ? id : entryLocale(id, config.locales).slug
}

/**
 * The route pattern a feed format is injected at, relative to Astro's `base`:
 * the filename under the config's locale prefix, such as `/fr/rss.xml`. Returns
 * `undefined` when the format is disabled.
 */
export function feedRoutePattern(
	config: ResolvedFeedKitConfig,
	kind: keyof FormatFilenames,
): string | undefined {
	const filename = config.formats[kind]
	return filename === undefined ? undefined : `/${config.locale?.prefix ?? ''}${filename}`
}

/**
 * Return the root-relative path a feed format is served at, including Astro's
 * `base` and the config's locale prefix (e.g. `/blog/fr/rss.xml`). Returns
 * `undefined` when the format has been disabled (`formats: { [kind]: false }`).
 * Useful when manually placing routes that must line up with the filenames
 * declared in `formats`, and for guarding `<link rel="alternate">` tags on
 * disabled formats. Pass a config from `localizeConfig` for another locale.
 */
export function getFeedPath(
	config: ResolvedFeedKitConfig,
	kind: keyof FormatFilenames,
): string | undefined {
	const pattern = feedRoutePattern(config, kind)
	return pattern === undefined ? undefined : `${config.base}${pattern.slice(1)}`
}
