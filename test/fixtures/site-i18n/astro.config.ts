import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	i18n: { defaultLocale: 'en', locales: ['en', 'fr'] },
	integrations: [
		feedKit({
			excerptBoundary: (locale) => ({
				comment: 'excerpt',
				readMore: locale === 'fr' ? 'Lire la suite' : true,
			}),
			feedOptions: (locale) => ({
				description: locale === 'fr' ? 'Fixture feed (fr).' : 'Fixture feed.',
				title: locale === 'fr' ? 'Fixture (fr)' : 'Fixture',
			}),
			i18n: true,
			sources: ['posts'],
		}),
	],
	outDir: './dist/i18n',
	site: 'https://example.com',
})
