import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'

export type Locale = 'en' | 'fr'

/**
 * The entry id without its locale folder: `fr/premier-billet` becomes
 * `premier-billet`.
 */
export function postSlug(id: string): string {
	return id.startsWith('en/') || id.startsWith('fr/') ? id.slice(3) : id
}

/**
 * The posts of one locale, newest first. Posts at the collection root belong to
 * the default locale, matching how the feed assigns them.
 */
export async function postsFor(locale: Locale): Promise<Array<CollectionEntry<'posts'>>> {
	const posts = await getCollection('posts', (entry) =>
		locale === 'fr' ? entry.id.startsWith('fr/') : !entry.id.startsWith('fr/'),
	)
	return posts.toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

/** The page path of a post in its locale, the same URL the feed links to. */
export function postPath(locale: Locale, id: string): string {
	return `${locale === 'fr' ? '/fr' : ''}/posts/${postSlug(id)}/`
}
