import type { CollectionEntry, CollectionKey } from 'astro:content'
import type { ResolvedFeedKitConfig, Source } from './config'
import { FeedEligibleEntrySchema } from './schemas'

function readField(data: unknown, key: string): unknown {
	if (typeof data !== 'object' || data === null) {
		return undefined
	}

	// Narrowed to a non-null object; indexed read via a widening assertion
	// is intentional — entry.data is a declared-schema union, but for
	// site-agnostic filter defaults we need to probe common fields by
	// name without per-collection branches.

	return (data as Record<string, unknown>)[key]
}

function defaultEligibilityFilter(entry: CollectionEntry<CollectionKey>): boolean {
	// Excludes drafts by convention. `draft: true` is a widely used flag in
	// Astro blog templates and ports of the Hugo/Jekyll frontmatter idiom.
	// Collections that don't declare the field are unaffected — it reads as
	// undefined and passes the check.
	return readField(entry.data, 'draft') !== true
}

/**
 * A single source's eligible entries, grouped together so downstream code knows
 * which `Source` produced each entry. This matters because per-source `link`
 * and `resolve` run against their originating source, and the item pipeline in
 * `feed.ts` needs to look those up per entry.
 */
export type SourceEntries = {
	entries: Array<CollectionEntry<CollectionKey>>
	source: Source
}

/**
 * Load each configured source's eligible entries. For every source, applies
 * four gates in order:
 *
 * 1. Filter — built-in gate (drops `draft: true`) composed with the source's
 *    optional `filter`.
 * 2. Contract validation — `FeedEligibleEntrySchema` (`{title, date}`) is enforced
 *    on each surviving entry's `data`. Throws with collection and id context on
 *    failure; silent exclusion would mask real problems.
 * 3. Sort — if the source sets `sort`, applies it; otherwise preserves
 *    `getCollection` order.
 * 4. Limit — if the source sets `limit`, caps to that many entries.
 *
 * Returns one group per source; merging and the final item-level sort/limit
 * happen in `feed.ts` after resolvers run.
 */
export async function getFeedContent(config: ResolvedFeedKitConfig): Promise<SourceEntries[]> {
	// `astro:content` is a Vite virtual module — dynamically imported here so
	// the package's barrel can be safely loaded from `astro.config.ts` (where
	// Vite hasn't booted yet) without crashing.
	const { getCollection } = await import('astro:content')

	const groups: SourceEntries[] = []
	for (const source of config.sources) {
		// Aliased to a local so the call site reads `sourceFilter(entry)`
		// rather than `source.filter(entry)`, which would false-positive
		// against unicorn/no-array-callback-reference as if it were
		// Array#filter.
		const sourceFilter = source.filter
		// `CollectionKey` is a union of declared collection names at compile
		// time but just `string` at runtime. A single cast at the
		// `getCollection` boundary keeps the rest of the pipeline honest.
		const entries = await getCollection(
			source.collection as CollectionKey,
			(entry: CollectionEntry<CollectionKey>) => {
				if (!defaultEligibilityFilter(entry)) {
					return false
				}

				if (sourceFilter !== undefined && !sourceFilter(entry)) {
					return false
				}

				return true
			},
		)

		const validated: Array<CollectionEntry<CollectionKey>> = []
		for (const entry of entries) {
			const parsed = FeedEligibleEntrySchema.safeParse(entry.data)
			if (!parsed.success) {
				throw new Error(
					`Entry ${entry.collection}/${entry.id} is missing required feed fields ` +
						`(title, date): ${parsed.error.message}`,
				)
			}

			validated.push(entry)
		}

		const sorted = source.sort === undefined ? validated : validated.toSorted(source.sort)
		const limited = source.limit === undefined ? sorted : sorted.slice(0, source.limit)

		groups.push({ entries: limited, source })
	}

	return groups
}
