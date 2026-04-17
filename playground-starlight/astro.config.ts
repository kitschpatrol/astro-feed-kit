/* eslint-disable ts/naming-convention */

import starlight from '@astrojs/starlight'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		starlight({
			components: {
				Head: './src/components/Head.astro',
			},
			sidebar: [
				{
					items: [{ label: 'Middleware', slug: 'middleware' }],
					label: 'Tests',
				},
			],
			title: 'astro-feed-kit',
		}),
		feedKit({
			contentCollections: [
				{
					key: 'docs',
					// Starlight mounts the `docs` collection at the site root, so feed
					// links should drop the `docs/` collection prefix feed-kit uses by
					// default (`{siteUrl}/{collection}/{entry.id}/`).
					link: (entry, { siteUrl }) =>
						new URL(`${entry.id}/`, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString(),
				},
			],
			feedOptions: {
				description: 'Docs feed from the astro-feed-kit Starlight playground.',
				title: 'astro-feed-kit (Starlight)',
			},
			// Skip pages with no `date` in frontmatter (e.g. the splash homepage).
			filter: (entry) => 'date' in entry.data && entry.data.date !== undefined,
		}),
	],
	site: 'http://localhost:4321',
})
