import type { AstroIntegration } from 'astro'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { FeedKitConfig, FormatFilenames } from './integration/config'
import {
	defineFeedKitConfig,
	feedRoutePattern,
	FORMAT_KINDS,
	getFeedPath,
	localizeConfig,
} from './integration/config'
import { configBridgePlugin, configSymbolKey } from './internal/vite-plugin'

export type {
	AstroSiteOptions,
	ExcerptBoundary,
	FeedKitConfig,
	FormatFilenames,
	FormatsInput,
	ItemResolver,
	ItemResolverArgs,
	Localizable,
	ResolvedFeedKitConfig,
	ResolvedLocale,
	Source,
	SourceInput,
} from './integration/config'
export { defineFeedKitConfig, getFeedPath, localizeConfig } from './integration/config'
export { generateFeed } from './integration/feed'
export { tagCategoryResolver } from './integration/item-map'
export type { AstroI18nOptions } from './integration/locale'
export type { FeedEligibleEntry, Item } from './integration/schemas'
export {
	AuthorSchema,
	CategorySchema,
	EnclosureSchema,
	ExtensionSchema,
	FeedEligibleEntrySchema,
	ItemSchema,
} from './integration/schemas'
export { serializeFeed } from './integration/serialize'

const ENDPOINT_FILES: Record<keyof FormatFilenames, string> = {
	atom: './internal/endpoints/atom.js',
	json: './internal/endpoints/json.js',
	rss: './internal/endpoints/rss.js',
}

/**
 * Astro integration that wires three prerendered feed endpoints (RSS, Atom,
 * JSON Feed) over a user-provided feed configuration.
 *
 * The integration serializes the resolved config into a `globalThis` slot and
 * exposes it to the injected endpoints via the `virtual:astro-feed-kit/config`
 * Vite virtual module. Closures and other non-serializable resolver fields are
 * passed by reference through that slot — both the integration and the
 * Vite-loaded endpoints run in the same Node process.
 */
export default function feedKit(input: FeedKitConfig): AstroIntegration {
	const instanceId = randomUUID()

	return {
		hooks: {
			'astro:config:done'({ injectTypes }) {
				injectTypes({
					content: `declare module 'virtual:astro-feed-kit/config' {
	const config: import('astro-feed-kit').ResolvedFeedKitConfig
	export default config
}
`,
					filename: 'astro-feed-kit.d.ts',
				})
			},
			'astro:config:setup'({ config: astroConfig, injectRoute, logger, updateConfig }) {
				const resolved = defineFeedKitConfig(input, {
					base: astroConfig.base,
					buildFormat: astroConfig.build.format,
					i18n: astroConfig.i18n,
					site: astroConfig.site,
					trailingSlash: astroConfig.trailingSlash,
				})

				// Surface a missing site URL here rather than at endpoint time,
				// so misconfiguration is caught at build start.
				if (resolved.feedOptions.link === undefined) {
					throw new Error(
						'astro-feed-kit: feedOptions.link was not provided and astro config has no `site` URL set. ' +
							'Set one or the other so per-item permalinks can be built.',
					)
				}

				// Capture Astro's canonical project root so endpoint-time
				// renderer probing resolves bare specifiers against the
				// consumer's `node_modules`, not against wherever
				// `astro-feed-kit` happens to be installed or linked. We do
				// NOT probe here — this hook runs inside Astro's Vite
				// config-loading module runner, and its lifecycle doesn't
				// reliably cover `await import(...)` calls during `astro check`.
				resolved.projectRoot = fileURLToPath(astroConfig.root)
				;(globalThis as Record<symbol, unknown>)[Symbol.for(configSymbolKey(instanceId))] = resolved

				updateConfig({
					vite: {
						plugins: [configBridgePlugin(instanceId)],
					},
				})

				// One set of endpoints per locale with `i18n`, otherwise just one.
				// The same three entrypoints back every locale; each request
				// finds its locale from the route pattern it matched.
				const localeConfigs =
					resolved.locales === undefined
						? [resolved]
						: resolved.locales.map((locale) => localizeConfig(resolved, locale.code))

				const mountedPaths: string[] = []
				for (const localeConfig of localeConfigs) {
					for (const kind of FORMAT_KINDS) {
						const pattern = feedRoutePattern(localeConfig, kind)
						const mountedPath = getFeedPath(localeConfig, kind)
						if (pattern === undefined || mountedPath === undefined) {
							continue
						}

						// Astro serves injected routes under `base` on its own, so
						// the pattern stays base-relative.
						injectRoute({
							entrypoint: fileURLToPath(new URL(ENDPOINT_FILES[kind], import.meta.url)),
							pattern,
							prerender: true,
						})
						mountedPaths.push(mountedPath)
					}
				}

				if (mountedPaths.length === 0) {
					logger.warn(
						'all feed formats are disabled in `formats` — no routes injected and <FeedKit /> will render nothing',
					)
				} else {
					logger.info(`mounted feed endpoints: ${mountedPaths.join(', ')}`)
				}
			},
		},
		name: 'astro-feed-kit',
	}
}
