import type { CollectionEntry, CollectionKey } from 'astro:content'
import { metadata } from './data/metadata'
import { defineFeedConfig, tagCategoryResolver } from './integrations/feed-kit'

const leadingSlashRegex = /^\/+/
const htmlExtensionRegex = /\.html$/

function resolveSlug(entry: CollectionEntry<CollectionKey>): string {
	// Mirrors the logic in `utilities/collections#entrySlug`: prefer an
	// explicit `permalink` frontmatter field, otherwise fall back to the
	// content entry id. Strip any leading slashes or trailing `.html` so the
	// result can be fed to `new URL`.
	let raw: string = entry.id
	if ('permalink' in entry.data && typeof entry.data.permalink === 'string') {
		raw = entry.data.permalink
	}
	return raw.replace(leadingSlashRegex, '').replace(htmlExtensionRegex, '')
}

function entryLink(entry: CollectionEntry<CollectionKey>, context: { siteUrl: string }): string {
	return new URL(`/${resolveSlug(entry)}`, context.siteUrl).toString()
}

/**
 * Site-specific feed configuration. The feed-kit library stays free of any
 * imports from `src/data/metadata`; this file is the single seam where
 * site-wide values flow into feed generation.
 */
export const feedConfig = defineFeedConfig({
	contentCollections: [
		{ key: 'posts', link: entryLink },
		{ key: 'notes', link: entryLink },
	],
	feedOptions: {
		author: {
			email: metadata.author.email,
			link: metadata.author.url,
			name: metadata.author.name,
		},
		copyright: metadata.license.name,
		description: metadata.description,
		language: metadata.language,
		link: metadata.url,
		stylesheet: 'pretty-feed-v3.xsl',
		title: metadata.title,
	},
	resolvers: {
		category: tagCategoryResolver({ basePath: '/tags/' }),
	},
})
