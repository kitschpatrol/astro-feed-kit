/* eslint-disable ts/naming-convention */

import starlight from '@astrojs/starlight'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		// Starlight's own i18n setup: one folder per language under
		// `src/content/docs/`. Starlight turns this into Astro's `i18n` config
		// (with the default locale prefixed, since there is no root locale), so
		// `feedKit()` below sees it. Keep `feedKit()` after `starlight()`.
		starlight({
			components: {
				Head: './src/components/Head.astro',
			},
			defaultLocale: 'en',
			locales: {
				en: { label: 'English' },
				fr: { label: 'Français', lang: 'fr' },
			},
			sidebar: [
				{
					items: [
						{
							label: 'Hello, feed-kit',
							slug: 'hello-feed-kit',
							translations: { fr: 'Bonjour, feed-kit' },
						},
						{
							label: 'Plain markdown entry',
							slug: 'markdown-post',
							translations: { fr: 'Entrée Markdown' },
						},
						{
							label: 'English only',
							slug: 'english-only',
							translations: { fr: 'Anglais seulement' },
						},
					],
					label: 'Entries',
					translations: { fr: 'Entrées' },
				},
			],
			title: 'astro-feed-kit',
		}),
		feedKit({
			feedOptions: (locale) => ({
				description:
					locale === 'fr'
						? 'Flux de test du bac à sable Starlight.'
						: 'Docs feed from the astro-feed-kit Starlight i18n playground.',
				title:
					locale === 'fr' ? 'astro-feed-kit (Starlight, fr)' : 'astro-feed-kit (Starlight, en)',
			}),
			i18n: true,
			sources: [
				{
					collection: 'docs',
					// Starlight pages without a `date` (e.g. each locale's homepage)
					// have no place in a dated feed.
					filter: (entry) => 'date' in entry.data && entry.data.date !== undefined,
					// Starlight mounts the `docs` collection at the site root under
					// each locale's prefix. `siteUrl` already carries that prefix and
					// `slug` drops the locale folder, so only the `docs/` collection
					// segment feed-kit would add by default needs to go.
					resolveItem: ({ siteUrl, slug }) => ({
						link: new URL(`${slug}/`, siteUrl).href,
					}),
				},
			],
		}),
	],
	// Without a root locale, Starlight builds no page at `/`: English lives
	// at `/en/` and French at `/fr/`. Send the root to the default locale.
	redirects: { '/': '/en/' },
	site: 'http://localhost:4321',
})
