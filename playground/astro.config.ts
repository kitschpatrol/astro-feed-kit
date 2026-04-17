import mdx from '@astrojs/mdx'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

export default defineConfig({
	integrations: [
		feedKit({
			contentCollections: [
				{ key: 'posts' },
				{
					key: 'notes',
					resolvers: {
						category: {
							from: 'categories',
							transform: (value) =>
								Array.isArray(value)
									? value
											.filter((name): name is string => typeof name === 'string')
											.map((name) => ({ name, term: name.toLowerCase() }))
									: undefined,
						},
						description: 'summary',
					},
				},
			],
			feedOptions: {
				description: 'Demo feed exercising the astro-feed-kit integration.',
				title: 'astro-feed-kit playground',
			},
		}),
		mdx(),
	],
	site: 'http://localhost:4321',
})
