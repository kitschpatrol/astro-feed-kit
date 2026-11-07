import type { Feed } from 'feed'
import config from 'virtual:astro-feed-kit/config'
import { generateFeed } from '../integration/feed'

let buildFeed: Promise<Feed> | undefined

/**
 * Generate the feed served by the injected endpoints.
 *
 * In dev, every request regenerates the feed so content edits show up on
 * reload. During `astro build`, content can't change, so the RSS, Atom, and
 * JSON endpoints share one generation pass instead of each rendering every
 * entry again. Serializing a `Feed` doesn't mutate it, so one instance safely
 * backs all three formats.
 */
export async function loadFeed(): Promise<Feed> {
	if (import.meta.env.DEV) {
		return generateFeed(config)
	}

	buildFeed ??= generateFeed(config)
	return buildFeed
}
