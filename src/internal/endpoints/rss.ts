import type { APIRoute } from 'astro'
import { serializeFeed } from '../../integration/serialize'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async () => {
	const feed = await loadFeed()
	return new Response(serializeFeed(feed, 'rss'), {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	})
}
