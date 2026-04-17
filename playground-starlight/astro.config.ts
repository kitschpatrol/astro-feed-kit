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
			feedOptions: {
				description: 'Docs feed from the astro-feed-kit Starlight playground.',
				title: 'astro-feed-kit (Starlight)',
			},
			sources: [
				{
					collection: 'docs',
					// Starlight pages without a `date` (e.g. the splash homepage)
					// have no place in a dated feed.
					filter: (entry) => 'date' in entry.data && entry.data.date !== undefined,
					// Starlight mounts the `docs` collection at the site root, so feed
					// links should drop the `docs/` collection prefix feed-kit uses by
					// default (`{siteUrl}/{collection}/{entry.id}/`).
					link: (entry, { siteUrl }) =>
						new URL(`${entry.id}/`, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString(),
				},
			],
		}),
	],
	site: 'http://localhost:4321',
})
