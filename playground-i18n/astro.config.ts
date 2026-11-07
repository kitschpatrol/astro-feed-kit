import mdx from '@astrojs/mdx'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	i18n: {
		defaultLocale: 'en',
		locales: ['en', 'fr'],
	},
	integrations: [
		feedKit({
			excerptBoundary: (locale) => ({
				comment: 'excerpt',
				readMore: locale === 'fr' ? 'Lire la suite →' : true,
			}),
			feedOptions: (locale) => ({
				description:
					locale === 'fr'
						? 'Flux de test pour astro-feed-kit.'
						: 'Demo feed exercising astro-feed-kit with Astro i18n routing.',
				title: locale === 'fr' ? 'Bac à sable astro-feed-kit' : 'astro-feed-kit i18n playground',
			}),
			i18n: true,
			sources: ['posts'],
		}),
		mdx(),
	],
	site: 'http://localhost:4321',
})
