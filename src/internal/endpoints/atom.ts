import type { APIRoute } from 'astro'
import { serializeFeed } from '../../integration/serialize'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async ({ routePattern }) => {
	const feed = await loadFeed(routePattern)
	return new Response(serializeFeed(feed, 'atom'), {
		headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
	})
}
