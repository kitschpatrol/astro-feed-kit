import type { APIRoute } from 'astro'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async () => {
	const feed = await loadFeed()
	return new Response(feed.atom1(), {
		headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
	})
}
