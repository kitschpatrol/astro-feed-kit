import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { CollectionConfig, EntryResolver, ItemResolvers, ResolverContext } from './config'
import type { Item } from './schemas'

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replaceAll(/[^\w\s-]/g, '')
		.replaceAll(/\s+/g, '-')
		.replaceAll(/-+/g, '-')
		.trim()
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith('/') ? value : `${value}/`
}

function readField(data: unknown, key: string): unknown {
	if (typeof data !== 'object' || data === null) return undefined
	// Narrowed to a non-null object; string-resolver lookups read fields by
	// name regardless of the entry's declared schema.
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return (data as Record<string, unknown>)[key]
}

function evaluateResolver(
	resolver: EntryResolver<unknown>,
	entry: CollectionEntry<CollectionKey>,
	context: ResolverContext,
): unknown {
	if (typeof resolver === 'string') {
		return readField(entry.data, resolver)
	}
	if (typeof resolver === 'function') {
		return resolver(entry, context)
	}
	return resolver.transform(readField(entry.data, resolver.from), context)
}

/**
 * Built-in default resolvers. Chosen to match the common Astro content
 * frontmatter conventions (`title`, `date`, `description`, `tags`) and to
 * populate `content` from the sanitized, rendered HTML passed through
 * `ResolverContext`.
 *
 * The category resolver intentionally emits `{name, term}` only — no
 * `domain`. Sites that want per-tag URLs in the feed should supply
 * `tagCategoryResolver({basePath})` as a top-level or per-collection
 * override.
 */
const DEFAULT_RESOLVERS: ItemResolvers = {
	category: {
		from: 'tags',
		transform(value) {
			if (!Array.isArray(value)) return
			const tags = value.filter((tag): tag is string => typeof tag === 'string')
			if (tags.length === 0) return
			return tags.map((name) => ({ name, term: slugify(name) }))
		},
	},
	content: (_, context) => context.renderedHtml,
	date: 'date',
	description: 'description',
	published: 'date',
	title: 'title',
}

/**
 * Apply the resolver chain for a single entry. Precedence, high to low:
 *
 * 1. `collectionConfig.resolvers[key]` — per-collection override
 * 2. `topLevelResolvers[key]` — site-wide override from `FeedConfig.resolvers`
 * 3. `DEFAULT_RESOLVERS[key]` — built-in
 *
 * Resolvers returning `undefined` are treated as "no value" and the
 * corresponding field is omitted from the returned partial item.
 */
export function applyResolvers(
	entry: CollectionEntry<CollectionKey>,
	collectionConfig: CollectionConfig,
	topLevelResolvers: ItemResolvers,
	context: ResolverContext,
): Partial<Item> {
	const allKeys = new Set<keyof Item>([
		...Object.keys(DEFAULT_RESOLVERS),
		...Object.keys(topLevelResolvers),
		...Object.keys(collectionConfig.resolvers ?? {}),
	])

	const result: Record<string, unknown> = {}
	for (const key of allKeys) {
		const resolver =
			collectionConfig.resolvers?.[key] ?? topLevelResolvers[key] ?? DEFAULT_RESOLVERS[key]
		if (resolver === undefined) continue
		const value = evaluateResolver(resolver, entry, context)
		if (value !== undefined) {
			result[key] = value
		}
	}
	return result as Partial<Item>
}

/**
 * Build a category resolver that emits `{name, term, domain}` with a
 * per-tag URL derived from `basePath` and the site URL in the resolver
 * context. Use this on sites that route tag pages under a stable URL
 * prefix — for example `tagCategoryResolver({basePath: '/tags/'})`.
 */
export function tagCategoryResolver(options: {
	basePath: string
}): EntryResolver<Item['category']> {
	return {
		from: 'tags',
		transform(value, context) {
			if (!Array.isArray(value)) return
			const tags = value.filter((tag): tag is string => typeof tag === 'string')
			if (tags.length === 0) return
			const base = new URL(options.basePath, ensureTrailingSlash(context.siteUrl)).toString()
			return tags.map((name) => {
				const term = slugify(name)
				return {
					domain: new URL(term, ensureTrailingSlash(base)).toString(),
					name,
					term,
				}
			})
		},
	}
}
