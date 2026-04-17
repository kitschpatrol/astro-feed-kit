import type { APIRoute } from 'astro'
import config from 'virtual:astro-feed-kit/config'
import { generateFeed } from '../../integration/feed'

export const prerender = true

export const GET: APIRoute = async () => {
	const feed = await generateFeed(config)
	return new Response(feed.atom1(), {
		headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
	})
}
