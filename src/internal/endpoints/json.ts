import type { APIRoute } from 'astro'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async () => {
	const feed = await loadFeed()
	return new Response(feed.json1(), {
		headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
	})
}
