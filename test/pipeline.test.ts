/* eslint-disable ts/no-unsafe-type-assertion */

// Exercises `generateFeed` end-to-end without booting Astro. `astro:content`
// is mocked to return a deterministic set of entries per collection so the
// test controls exactly what the pipeline sees. `includeContent: false`
// skips the AstroContainer / renderer path entirely, keeping the test free
// of container probing and Vite module-graph concerns.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '../src/integration/schemas'
import { defineFeedKitConfig } from '../src/integration/config'
import { generateFeed } from '../src/integration/feed'

type FakeEntry = {
	collection: string
	data: Record<string, unknown>
	id: string
}

const EXAMPLE_LINK_RE = /^https:\/\/example\.com\//

const entryStore = new Map<string, FakeEntry[]>()

function setCollection(name: string, entries: FakeEntry[]): void {
	entryStore.set(name, entries)
}

vi.mock('astro:content', () => ({
	async getCollection(name: string, filter?: (entry: FakeEntry) => boolean): Promise<FakeEntry[]> {
		const entries = await Promise.resolve(entryStore.get(name) ?? [])
		return filter === undefined ? entries : entries.filter((entry) => filter(entry))
	},
}))

function entry(collection: string, id: string, data: Record<string, unknown>): FakeEntry {
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
			entry('posts', 'a', { date: new Date('2026-01-01'), title: 'A' }),
			entry('posts', 'b', { archived: true, date: new Date('2026-02-01'), title: 'B' }),
		])
		setCollection('notes', [
			entry('notes', 'c', { archived: true, date: new Date('2026-03-01'), title: 'C' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				{
					collection: 'posts',
					filter: (entry) => (entry.data as Record<string, unknown>).archived !== true,
				},
				{ collection: 'notes' },
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
			entry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
			entry('posts', 'p2', { date: new Date('2026-02-01'), title: 'P2' }),
			entry('posts', 'p3', { date: new Date('2026-03-01'), title: 'P3' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				{
					collection: 'posts',
					limit: 2,
					sort: (a, b) => b.data.date!.getTime() - a.data.date!.getTime(),
				},
			],
		})

		const feed = await generateFeed(config)
		const titles = (feed.items as unknown as Item[]).map((item) => item.title)
		expect(titles).toEqual(['P3', 'P2'])
	})
})

describe('pipeline: top-level sort and limit on merged items', () => {
	it('top-level sort reorders the merged item set and receives Item shape', async () => {
		setCollection('posts', [entry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' })])
		setCollection('notes', [entry('notes', 'n1', { date: new Date('2026-02-01'), title: 'N1' })])

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
			sources: [{ collection: 'posts' }, { collection: 'notes' }],
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
			entry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' }),
			entry('posts', 'p2', { date: new Date('2026-02-01'), title: 'P2' }),
		])
		setCollection('notes', [
			entry('notes', 'n1', { date: new Date('2026-03-01'), title: 'N1' }),
			entry('notes', 'n2', { date: new Date('2026-04-01'), title: 'N2' }),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			limit: 2,
			sources: [{ collection: 'posts' }, { collection: 'notes' }],
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
			entry('posts', 'p1', {
				date: new Date('2026-01-01'),
				summary: 'override summary',
				title: 'P1',
			}),
		])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: [
				{
					collection: 'posts',
					resolveItem: (entry) => ({
						description: (entry.data as Record<string, unknown>).summary as string,
					}),
				},
			],
		})

		const feed = await generateFeed(config)
		const first = (feed.items as unknown as Item[])[0]!
		expect(first.description).toBe('override summary')
	})

	it('string shorthand sources expand to default behavior', async () => {
		setCollection('posts', [entry('posts', 'p1', { date: new Date('2026-01-01'), title: 'P1' })])

		const config = defineFeedKitConfig({
			feedOptions: baseFeedOptions,
			includeContent: false,
			sources: ['posts'],
		})

		const feed = await generateFeed(config)
		const first = (feed.items as unknown as Item[])[0]!
		expect(first.title).toBe('P1')
		// Default link builder: {siteUrl}/{collection}/{entry.id}/
		expect(first.link).toBe('https://example.com/posts/p1/')
	})
})
