import type { APIRoute } from 'astro'
import { serializeFeed } from '../../integration/serialize'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async ({ routePattern }) => {
	const feed = await loadFeed(routePattern)
	return new Response(serializeFeed(feed, 'json'), {
		headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
	})
}
