import type { ItemResolver, ItemResolverArgs } from './config'
import type { Item } from './schemas'

/**
 * Lowercase, drop everything that isn't a letter, number, whitespace, or hyphen
 * (Unicode-aware, so non-Latin tags keep their characters), collapse whitespace
 * and hyphen runs to a single hyphen, and strip edge hyphens.
 */
function slugify(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}\s\-]/gv, '')
		.replaceAll(/[\s\-]+/gv, '-')
		.replaceAll(/^-|-$/gv, '')
}

const LEADING_SLASHES = /^\/+/v

function ensureTrailingSlash(value: string): string {
	return value.endsWith('/') ? value : `${value}/`
}

function readField(data: unknown, key: string): unknown {
	// Narrowed to a non-null object; default resolvers read common fields by
	// name across arbitrary collection schemas.
	return typeof data === 'object' && data !== null
		? (data as Record<string, unknown>)[key]
		: undefined
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function asDate(value: unknown): Date | undefined {
	if (value instanceof Date) {
		return value
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const date = new Date(value)
		if (!Number.isNaN(date.getTime())) {
			return date
		}
	}

	return undefined
}

function categoryFromTags(value: unknown): Item['category'] | undefined {
	if (!Array.isArray(value)) {
		return undefined
	}

	const tags = value.filter((tag): tag is string => typeof tag === 'string')
	return tags.length === 0 ? undefined : tags.map((name) => ({ name, term: slugify(name) }))
}

/**
 * Built-in item defaults. Produces a `Partial<Item>` from the common Astro
 * frontmatter conventions (`title`, `date`, `description`, `tags`) plus a
 * default `link` derived from `siteUrl`, `entry.collection`, and `slug` (the
 * entry id without its locale folder), ending with `/` when
 * `appendTrailingSlash` is set. This is the baseline that a user's
 * `Source.resolveItem` overlay merges on top of.
 *
 * The category default intentionally emits `{name, term}` only — no `domain`.
 * Sites that want per-tag URLs in the feed should spread
 * `tagCategoryResolver({basePath})({entry, siteUrl})` inside their own
 * `Source.resolveItem`.
 *
 * `content` is deliberately not set here — the pipeline fills it from the
 * sanitized rendered HTML after all resolvers have run.
 */
export function defaultItemResolver(
	{ entry, siteUrl, slug }: ItemResolverArgs,
	appendTrailingSlash = true,
): Partial<Item> {
	const { data } = entry
	const title = asString(readField(data, 'title'))
	const date = asDate(readField(data, 'date'))
	const description = asString(readField(data, 'description'))
	const category = categoryFromTags(readField(data, 'tags'))

	const path = `${entry.collection}/${slug}${appendTrailingSlash ? '/' : ''}`
	const result: Partial<Item> = {
		link: new URL(path, ensureTrailingSlash(siteUrl)).href,
	}
	if (title !== undefined) {
		result.title = title
	}

	if (date !== undefined) {
		result.date = date
		result.published = date
	}

	if (description !== undefined) {
		result.description = description
	}

	if (category !== undefined) {
		result.category = category
	}

	return result
}

/**
 * Merge a lower-priority partial with a higher-priority partial, skipping keys
 * whose value on the higher-priority side is `undefined`. This is what gives a
 * user's `resolveItem` the freedom to override only the fields they care about
 * while leaving defaults intact.
 */
function mergeSkippingUndefined(lower: Partial<Item>, higher: Partial<Item>): Partial<Item> {
	const merged: Partial<Item> = { ...lower }
	// `Object.keys` over `Object.entries` avoids the per-key two-element
	// tuple allocation. Per-entry cost shows up in bench when a
	// `resolveItem` overlay is present; the field set is small, but this
	// runs once per entry.
	const higherRecord = higher as Record<string, unknown>
	// eslint-disable-next-line unicorn/prefer-object-iterable-methods
	for (const key of Object.keys(higherRecord)) {
		const value = higherRecord[key]
		if (value === undefined) {
			continue
		}

		// The Item type has narrow per-key value types; the loop widens them,
		// and we reassign back via the same key. Safe within this function.
		;(merged as Record<string, unknown>)[key] = value
	}

	return merged
}

/**
 * Resolve the partial item fields for one entry. Starts from
 * `defaultItemResolver`'s baseline and layers `source.resolveItem` on top,
 * skipping keys the user's resolver returned as `undefined`.
 */
export function resolveItemFields(
	args: ItemResolverArgs,
	sourceResolveItem?: ItemResolver,
	appendTrailingSlash = true,
): Partial<Item> {
	const base = defaultItemResolver(args, appendTrailingSlash)
	return sourceResolveItem === undefined
		? base
		: mergeSkippingUndefined(base, sourceResolveItem(args))
}

/**
 * Build a helper that produces a `{category}` partial with per-tag URLs derived
 * from `basePath` and `siteUrl`. `basePath` is resolved relative to the site
 * root, so Astro's `base` is included whether or not `basePath` starts with
 * `/`. Spread the result inside a source's `resolveItem`:
 *
 * @example
 * 	resolveItem: (args) => ({
 * 		...tagCategoryResolver({ basePath: '/tags/' })(args),
 * 	})
 */
export function tagCategoryResolver(options: {
	basePath: string
}): (args: ItemResolverArgs) => { category?: Item['category'] } {
	return ({ entry, siteUrl }) => {
		const value = readField(entry.data, 'tags')
		if (!Array.isArray(value)) {
			return {}
		}

		const tags = value.filter((tag): tag is string => typeof tag === 'string')
		if (tags.length === 0) {
			return {}
		}

		const basePath = options.basePath.replace(LEADING_SLASHES, '')
		const base = new URL(basePath, ensureTrailingSlash(siteUrl)).href
		return {
			category: tags.map((name) => {
				const term = slugify(name)
				return {
					domain: new URL(term, ensureTrailingSlash(base)).href,
					name,
					term,
				}
			}),
		}
	}
}
