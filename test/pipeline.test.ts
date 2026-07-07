// Exercises `generateFeed` end-to-end without booting Astro. `astro:content`
// is mocked to return a deterministic set of entries per collection so the
// test controls exactly what the pipeline sees. `includeContent: false`
// skips the AstroContainer / renderer path entirely, keeping the test free
// of container probing and Vite module-graph concerns.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceInput } from '../src/integration/config'
import type { Item } from '../src/integration/schemas'
import { defineFeedKitConfig } from '../src/integration/config'
import { generateFeed } from '../src/integration/feed'

type FakeEntry = {
	collection: string
	data: Record<string, unknown>
	id: string
}

// Loose shape used when authoring synthetic source descriptors. Mirrors
// `Source<C>` but operates on `FakeEntry` and any string for `collection`,
// since these tests mock `astro:content` and the collection names here (e.g.
// 'posts', 'notes') intentionally live outside the real `CollectionKey`
// union declared in the consumer's project.
type FakeSource = {
	collection: string
	filter?: (entry: FakeEntry) => boolean
	limit?: number
	resolveItem?: (args: { entry: FakeEntry; siteUrl: string }) => Partial<Item>
	sort?: (a: FakeEntry, b: FakeEntry) => number
}

const EXAMPLE_LINK_RE = /^https:\/\/example\.com\//v

const entryStore = new Map<string, FakeEntry[]>()

function setCollection(name: string, entries: FakeEntry[]): void {
	entryStore.set(name, entries)
}

/**
 * Cast a synthetic source descriptor to `SourceInput`. The real type narrows
 * `collection` against the project's `CollectionKey`, but these tests use names
 * that aren't in that union — the pipeline operates on the mocked
 * `astro:content` entries, not real collections, so the narrowing would only
 * get in the way.
 */
function source(spec: FakeSource | string): SourceInput {
	return spec as unknown as SourceInput
}

vi.mock('astro:content', () => ({
	async getCollection(name: string, filter?: (entry: FakeEntry) => boolean): Promise<FakeEntry[]> {
		const entries = await Promise.resolve(entryStore.get(name) ?? [])
		return filter === undefined ? entries : entries.filter((entry) => filter(entry))
	},
}))

function makeEntry(collection: string, id: string, data: Record<string, unknown>): FakeEntry {
	return { collection, data, id }
}

const baseFeedOptions = {
	description: 'd',
	link: 'https://example.com',
	title: 't',
}

beforeEach(() => {
	entryStore.clear()
})

describe('pipeline: per-source behavior', () => {
	it('per-source filter narrows only that source', async () => {
		setCollection('posts', [
			makeEntry('posts', 'a', { date: new Date('2026-01-01'), title: 'A' }),
			makeEntry('posts', 'b', { archived: true, date: new Date('2026-02-01'), title: 'B' }),
		])
		setCollection('notes', [
			makeEntry('notes', 'c', { archived: true, date: new Date('2026-03-01'), title: 'C' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				source({
					collection: 'posts',
					filter: (entry) => entry.data.archived !== true,
				}),
				source({ collection: 'notes' }),
			],
		})

		const feed = await generateFeed(config)
		const titles = (feed.items as unknown as Item[]).map((item) => item.title)
		// `B` filtered out by per-source filter; `C` kept because `notes` has
		// no filter; `A` kept.
		expect(titles).toContain('A')
		expect(titles).toContain('C')
		expect(titles).not.toContain('B')
	})

	it('per-source sort + limit cap that source independently before merge', async () => {
		setCollection('posts', [
			makeEntry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
			makeEntry('posts', 'p2', { date: new Date('2026-02-01'), title: 'P2' }),
			makeEntry('posts', 'p3', { date: new Date('2026-03-01'), title: 'P3' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				source({
					collection: 'posts',
					limit: 2,
					sort: (a, b) => (b.data.date as Date).getTime() - (a.data.date as Date).getTime(),
				}),
			],
		})

		const feed = await generateFeed(config)
		const titles = (feed.items as unknown as Item[]).map((item) => item.title)
		expect(titles).toEqual(['P3', 'P2'])
	})
})

describe('pipeline: top-level sort and limit on merged items', () => {
	it('top-level sort reorders the merged item set and receives Item shape', async () => {
		setCollection('posts', [
			makeEntry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
		])
		setCollection('notes', [
			makeEntry('notes', 'n1', { date: new Date('2026-02-01'), title: 'N1' }),
		])

		let seenItemShape: Item | undefined
		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sort(a, b) {
				seenItemShape ??= a
				// Ascending by date to prove the user's comparator runs over
				// merged items.
				return a.date.getTime() - b.date.getTime()
			},
			sources: [source({ collection: 'posts' }), source({ collection: 'notes' })],
		})

		const feed = await generateFeed(config)
		const titles = (feed.items as unknown as Item[]).map((item) => item.title)
		expect(titles).toEqual(['P1', 'N1'])
		// Sanity: the comparator was handed a full item (has `link`, not just
		// raw entry `data`).
		expect(seenItemShape?.link).toMatch(EXAMPLE_LINK_RE)
	})

	it('top-level limit caps merged set after per-source limits', async () => {
		setCollection('posts', [
			makeEntry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
			makeEntry('posts', 'p2', { date: new Date('2026-02-01'), title: 'P2' }),
		])
		setCollection('notes', [
			makeEntry('notes', 'n1', { date: new Date('2026-03-01'), title: 'N1' }),
			makeEntry('notes', 'n2', { date: new Date('2026-04-01'), title: 'N2' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			limit: 2,
			sources: [source({ collection: 'posts' }), source({ collection: 'notes' })],
		})

		const feed = await generateFeed(config)
		expect(feed.items).toHaveLength(2)
		// Default sort is newest first, so N2 and N1 win.
		const titles = (feed.items as unknown as Item[]).map((item) => item.title)
		expect(titles).toEqual(['N2', 'N1'])
	})
})

describe('pipeline: per-source resolveItem', () => {
	it('per-source resolveItem output replaces fields the default filled in', async () => {
		setCollection('posts', [
			makeEntry('posts', 'p1', {
				date: new Date('2026-01-01'),
				summary: 'override summary',
				title: 'P1',
			}),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				source({
					collection: 'posts',
					resolveItem: ({ entry }) => ({
						description: entry.data.summary as string,
					}),
				}),
			],
		})

		const feed = await generateFeed(config)
		const first = (feed.items as unknown as Item[])[0]!
		expect(first.description).toBe('override summary')
	})

	it('string shorthand sources expand to default behavior', async () => {
		setCollection('posts', [
			makeEntry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [source('posts')],
		})

		const feed = await generateFeed(config)
		const first = (feed.items as unknown as Item[])[0]!
		expect(first.title).toBe('P1')
		// Default link builder: {siteUrl}/{collection}/{entry.id}/
		expect(first.link).toBe('https://example.com/posts/p1/')
	})
})
