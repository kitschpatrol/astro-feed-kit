import mdx from '@astrojs/mdx'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		feedKit({
			excerptBoundary: { comment: 'excerpt', readMore: true },
			feedOptions: { description: 'Fixture feed.', title: 'Fixture' },
			sources: ['posts'],
		}),
		mdx(),
	],
	outDir: './dist/root',
	site: 'https://example.com',
})
