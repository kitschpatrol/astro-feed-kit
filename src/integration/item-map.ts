import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { Resolve, ResolverContext } from './config'
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
	// Narrowed to a non-null object; default resolvers read common fields by
	// name across arbitrary collection schemas.
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return (data as Record<string, unknown>)[key]
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function asDate(value: unknown): Date | undefined {
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') {
		const date = new Date(value)
		if (!Number.isNaN(date.getTime())) return date
	}
	return undefined
}

function categoryFromTags(value: unknown): Item['category'] | undefined {
	if (!Array.isArray(value)) return undefined
	const tags = value.filter((tag): tag is string => typeof tag === 'string')
	if (tags.length === 0) return undefined
	return tags.map((name) => ({ name, term: slugify(name) }))
}

/**
 * Built-in item defaults. Produces a `Partial<Item>` from the common Astro
 * frontmatter conventions (`title`, `date`, `description`, `tags`) plus the
 * sanitized rendered HTML from `context`.
 *
 * The category default intentionally emits `{name, term}` only — no `domain`.
 * Sites that want per-tag URLs in the feed should spread
 * `tagCategoryResolver({basePath})(entry, context)` inside their own
 * `Source.resolve`.
 */
export function defaultResolve(
	entry: CollectionEntry<CollectionKey>,
	context: ResolverContext,
): Partial<Item> {
	const { data } = entry
	const title = asString(readField(data, 'title'))
	const date = asDate(readField(data, 'date'))
	const description = asString(readField(data, 'description'))
	const category = categoryFromTags(readField(data, 'tags'))

	const result: Partial<Item> = {}
	if (title !== undefined) result.title = title
	if (date !== undefined) {
		result.date = date
		result.published = date
	}
	if (description !== undefined) result.description = description
	if (category !== undefined) result.category = category
	if (context.renderedHtml !== '') result.content = context.renderedHtml
	return result
}

/**
 * Merge a lower-priority partial with a higher-priority partial, skipping
 * keys whose value on the higher-priority side is `undefined`. This is what
 * gives a user's `resolve` the freedom to override only the fields they care
 * about while leaving defaults intact.
 */
function mergeSkippingUndefined(lower: Partial<Item>, higher: Partial<Item>): Partial<Item> {
	const merged: Partial<Item> = { ...lower }
	for (const [key, value] of Object.entries(higher)) {
		if (value === undefined)
			continue
			// The Item type has narrow per-key value types; the loop widens them,
			// and we reassign back via the same key. Safe within this function.
		;(merged as Record<string, unknown>)[key] = value
	}
	return merged
}

/**
 * Resolve the partial item for one entry. Starts from `defaultResolve`'s
 * baseline and layers `source.resolve` on top, skipping keys the user's
 * resolver returned as `undefined`.
 */
export function resolveItem(
	entry: CollectionEntry<CollectionKey>,
	context: ResolverContext,
	sourceResolve?: Resolve,
): Partial<Item> {
	const base = defaultResolve(entry, context)
	if (sourceResolve === undefined) return base
	return mergeSkippingUndefined(base, sourceResolve(entry, context))
}

/**
 * Build a helper that produces a `{category}` partial with per-tag URLs
 * derived from `basePath` and the site URL in the resolver context. Spread
 * the result inside a source's `resolve`:
 *
 * @example
 * 	resolve: (entry, context) => ({
 * 		...tagCategoryResolver({ basePath: '/tags/' })(entry, context),
 * 	})
 */
export function tagCategoryResolver(options: {
	basePath: string
}): (
	entry: CollectionEntry<CollectionKey>,
	context: ResolverContext,
) => { category?: Item['category'] } {
	return (entry, context) => {
		const value = readField(entry.data, 'tags')
		if (!Array.isArray(value)) return {}
		const tags = value.filter((tag): tag is string => typeof tag === 'string')
		if (tags.length === 0) return {}
		const base = new URL(options.basePath, ensureTrailingSlash(context.siteUrl)).toString()
		return {
			category: tags.map((name) => {
				const term = slugify(name)
				return {
					domain: new URL(term, ensureTrailingSlash(base)).toString(),
					name,
					term,
				}
			}),
		}
	}
}
