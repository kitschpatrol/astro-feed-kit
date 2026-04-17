import mdx from '@astrojs/mdx'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

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
					resolve(entry) {
						const data = entry.data as Record<string, unknown>
						const { categories } = data
						const description = data.summary
						return {
							category: Array.isArray(categories)
								? categories
										.filter((name): name is string => typeof name === 'string')
										.map((name) => ({ name, term: name.toLowerCase() }))
								: undefined,
							description: typeof description === 'string' ? description : undefined,
						}
					},
				},
			],
		}),
		mdx(),
	],
	site: 'http://localhost:4321',
})
