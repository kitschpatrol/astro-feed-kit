import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	base: '/blog',
	integrations: [
		feedKit({
			excerptBoundary: { comment: 'excerpt', readMore: true },
			feedOptions: { description: 'Fixture feed.', title: 'Fixture' },
			formats: { atom: false, rss: 'feed.xml' },
			sources: ['posts'],
		}),
	],
	outDir: './dist/base',
	site: 'https://example.com',
	trailingSlash: 'never',
})
