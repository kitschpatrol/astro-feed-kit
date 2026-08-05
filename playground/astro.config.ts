import mdx from '@astrojs/mdx'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		feedKit({
			feedOptions: {
				description: 'Demo feed exercising the astro-feed-kit integration.',
				title: 'astro-feed-kit playground',
			},
			sources: [
				'posts',
				{
					collection: 'notes',
					resolveItem({ entry }) {
						const { categories, summary } = entry.data

						return {
							category: Array.isArray(categories)
								? categories
										.filter((name): name is string => typeof name === 'string')
										.map((name) => ({ name, term: name.toLowerCase() }))
								: undefined,
							description: summary,
						}
					},
				},
			],
		}),
		mdx(),
	],
	site: 'http://localhost:4321',
})
