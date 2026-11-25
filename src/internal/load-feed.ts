import type { Feed } from 'feed'
import config from 'virtual:astro-feed-kit/config'
import type { ResolvedFeedKitConfig } from '../integration/config'
import { feedRoutePattern, FORMAT_KINDS, localizeConfig } from '../integration/config'
import { generateFeed } from '../integration/feed'

const buildFeeds = new Map<string, Promise<Feed>>()

/**
 * The config for the feed served at `routePattern`. Without `i18n` there is one
 * feed, so the pattern does not matter. With `i18n`, every locale's endpoints
 * share the same entrypoints, so the locale is recovered by matching the
 * pattern Astro reports against the patterns the integration injected.
 */
function configForRoute(routePattern: string): ResolvedFeedKitConfig {
	if (config.locales === undefined) {
		return config
	}

	for (const locale of config.locales) {
		const localized = localizeConfig(config, locale.code)
		if (FORMAT_KINDS.some((kind) => feedRoutePattern(localized, kind) === routePattern)) {
			return localized
		}
	}

	throw new Error(`astro-feed-kit: no feed is configured for the route ${routePattern}.`)
}

/**
 * Generate the feed served by the injected endpoint whose route pattern is
 * `routePattern` (Astro's `context.routePattern`).
 *
 * In dev, every request regenerates the feed so content edits show up on
 * reload. During `astro build`, content can't change, so the RSS, Atom, and
 * JSON endpoints of one locale share one generation pass instead of each
 * rendering every entry again. Serializing a `Feed` doesn't mutate it, so one
 * instance safely backs all three formats.
 */
export async function loadFeed(routePattern: string): Promise<Feed> {
	const localized = configForRoute(routePattern)
	if (import.meta.env.DEV) {
		return generateFeed(localized)
	}

	const key = localized.locale?.code ?? ''
	let pending = buildFeeds.get(key)
	if (pending === undefined) {
		pending = generateFeed(localized)
		buildFeeds.set(key, pending)
	}

	return pending
}
