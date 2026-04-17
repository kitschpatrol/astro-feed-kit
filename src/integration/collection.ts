import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { FeedConfig } from './config'
import { FeedEligibleEntrySchema } from './schemas'

function readField(data: unknown, key: string): unknown {
	if (typeof data !== 'object' || data === null) return undefined
	// Narrowed to a non-null object; indexed read via a widening assertion
	// is intentional — entry.data is a declared-schema union, but for
	// site-agnostic filter/sort defaults we need to probe common fields by
	// name without per-collection branches.
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return (data as Record<string, unknown>)[key]
}

function defaultEligibilityFilter(entry: CollectionEntry<CollectionKey>): boolean {
	// Excludes drafts and encrypted entries by convention. Collections that
	// don't declare these fields are unaffected — missing fields read as
	// undefined and pass the check.
	if (readField(entry.data, 'draft') === true) return false
	if (readField(entry.data, 'encrypt') === true) return false
	return true
}

function readEntryDate(data: unknown): Date {
	const value = readField(data, 'date')
	if (value instanceof Date) return value
	return new Date(0)
}

function defaultSort(a: CollectionEntry<CollectionKey>, b: CollectionEntry<CollectionKey>): number {
	return readEntryDate(b.data).getTime() - readEntryDate(a.data).getTime()
}

/**
 * Load every entry from the collections listed in `config.contentCollections`
 * and produce a flat, sorted list of feed-eligible entries. Applies four gates,
 * in order:
 *
 * 1. Filter — default excludes `draft: true` and `encrypt: true`; composed with
 *    any user-supplied `config.filter`.
 * 2. Contract validation — `FeedEligibleEntrySchema` (`{title, date}`) is enforced
 *    on each surviving entry's `data`. Throws with collection and id context on
 *    failure; silent exclusion would mask real problems.
 * 3. Sort — default is `date` descending; replaced by `config.sort` when provided.
 * 4. Limit — keep at most `config.limit` entries after sort (default 25).
 */
export async function getFeedContent(
	config: FeedConfig,
): Promise<Array<CollectionEntry<CollectionKey>>> {
	// Aliased to a local so the call site reads `userFilter(entry)` rather
	// than `config.filter(entry)`, which would false-positive against
	// unicorn/no-array-callback-reference as if it were Array#filter.
	const userFilter = config.filter
	const combinedFilter = (entry: CollectionEntry<CollectionKey>): boolean => {
		if (!defaultEligibilityFilter(entry)) return false
		if (userFilter !== undefined && !userFilter(entry)) return false
		return true
	}

	// `astro:content` is a Vite virtual module — dynamically imported here so
	// the package's barrel can be safely loaded from `astro.config.ts` (where
	// Vite hasn't booted yet) without crashing.
	const { getCollection } = await import('astro:content')

	const allEntries: Array<CollectionEntry<CollectionKey>> = []
	for (const collectionConfig of config.contentCollections) {
		// `CollectionKey` is a union of declared collection names at compile
		// time but just `string` at runtime. A single cast at the
		// `getCollection` boundary keeps the rest of the pipeline honest.
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const entries = await getCollection(collectionConfig.key as CollectionKey, combinedFilter)
		for (const entry of entries) {
			const parsed = FeedEligibleEntrySchema.safeParse(entry.data)
			if (!parsed.success) {
				throw new Error(
					`Entry ${entry.collection}/${entry.id} is missing required feed fields ` +
						`(title, date): ${parsed.error.message}`,
				)
			}
			allEntries.push(entry)
		}
	}

	return allEntries.toSorted(config.sort ?? defaultSort).slice(0, config.limit)
}
