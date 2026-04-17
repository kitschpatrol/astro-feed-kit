import type { AstroIntegration } from 'astro'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { FeedConfigInput, FeedFilenames } from './integration/config'
import { defineFeedConfig } from './integration/config'
import { configBridgePlugin, configSymbolKey } from './internal/vite-plugin'

export type {
	CollectionConfig,
	EntryResolver,
	ExcerptBoundary,
	FeedConfig,
	FeedConfigInput,
	FeedFilenames,
	ItemResolvers,
	LinkContext,
	ResolverContext,
} from './integration/config'
export { defineFeedConfig, getFeedPath } from './integration/config'
export { generateFeed } from './integration/feed'
export { applyResolvers, tagCategoryResolver } from './integration/item-map'
export type { FeedEligibleEntry, Item } from './integration/schemas'
export {
	AuthorSchema,
	CategorySchema,
	EnclosureSchema,
	ExtensionSchema,
	FeedEligibleEntrySchema,
	ItemSchema,
} from './integration/schemas'

const ENDPOINT_FILES: Record<keyof FeedFilenames, string> = {
	atom: './internal/endpoints/atom.ts',
	json: './internal/endpoints/json.ts',
	rss: './internal/endpoints/rss.ts',
}

// Typed key list drives the endpoint injection loop. Declaring the tuple
// literal with `satisfies` preserves the narrow `keyof FeedFilenames` element
// type without asserting through `Object.entries`, which returns
// `[string, string][]`.
const ENDPOINT_KINDS = ['atom', 'json', 'rss'] as const satisfies ReadonlyArray<keyof FeedFilenames>

/**
 * Astro integration that wires three prerendered feed endpoints (RSS, Atom,
 * JSON Feed) over a user-provided feed configuration.
 *
 * The integration serializes the resolved config into a `globalThis` slot
 * and exposes it to the injected endpoints via the
 * `virtual:astro-feed-kit/config` Vite virtual module. Closures and other
 * non-serializable resolver fields are passed by reference through that
 * slot — both the integration and the Vite-loaded endpoints run in the same
 * Node process.
 */
export default function feedKit(input: FeedConfigInput): AstroIntegration {
	const instanceId = randomUUID()

	return {
		hooks: {
			'astro:config:done'({ injectTypes }) {
				injectTypes({
					content: `declare module 'virtual:astro-feed-kit/config' {
	const config: import('astro-feed-kit').FeedConfig
	export default config
}
`,
					filename: 'astro-feed-kit.d.ts',
				})
			},
			'astro:config:setup'({ config: astroConfig, injectRoute, logger, updateConfig }) {
				// Fall back to Astro's site URL when the user didn't supply
				// `feedOptions.link`. We surface this early (rather than at
				// endpoint time) so misconfiguration is caught at build start.
				const inputWithLink = ensureFeedLink(input, astroConfig.site)

				const resolved = defineFeedConfig(inputWithLink)

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

				for (const kind of ENDPOINT_KINDS) {
					const entrypoint = fileURLToPath(new URL(ENDPOINT_FILES[kind], import.meta.url))
					injectRoute({
						entrypoint,
						pattern: `/${resolved.feeds[kind]}`,
						prerender: true,
					})
				}

				logger.info(
					`mounted feed endpoints: /${resolved.feeds.rss}, /${resolved.feeds.atom}, /${resolved.feeds.json}`,
				)
			},
		},
		name: 'astro-feed-kit',
	}
}

function ensureFeedLink(input: FeedConfigInput, astroSite: string | undefined): FeedConfigInput {
	if (input.feedOptions.link !== undefined) return input
	if (astroSite === undefined) {
		throw new Error(
			'astro-feed-kit: feedOptions.link was not provided and astro config has no `site` URL set. ' +
				'Set one or the other so per-item permalinks can be built.',
		)
	}
	return {
		...input,
		feedOptions: {
			...input.feedOptions,
			link: astroSite,
		},
	}
}
