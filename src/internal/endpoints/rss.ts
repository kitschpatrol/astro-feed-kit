import type { APIRoute } from 'astro'
import { loadFeed } from '../load-feed'

export const prerender = true

export const GET: APIRoute = async () => {
	const feed = await loadFeed()
	return new Response(feed.rss2(), {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	})
}
