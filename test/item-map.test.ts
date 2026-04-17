/* eslint-disable ts/no-unsafe-type-assertion */
import type { CollectionEntry, CollectionKey } from 'astro:content'
import { describe, expect, it } from 'vitest'
import type { CollectionConfig, ResolverContext } from '../src/integration/config'
import { applyResolvers, tagCategoryResolver } from '../src/integration/item-map'

const CONTEXT: ResolverContext = {
	collection: 'posts',
	renderedHtml: '<p>html</p>',
	siteUrl: 'https://example.com/',
}

function makeEntry(data: Record<string, unknown>): CollectionEntry<CollectionKey> {
	return {
		body: '',
		collection: 'posts',
		data,
		id: 'sample',
	} as unknown as CollectionEntry<CollectionKey>
}

const baseCollectionConfig: CollectionConfig = {
	key: 'posts',
	link: () => 'https://example.com/posts/sample',
}

describe('applyResolvers', () => {
	it('applies built-in defaults for title/date/description/content', () => {
		const entry = makeEntry({
			date: new Date('2026-04-10T00:00:00Z'),
			description: 'Lead-in text.',
			title: 'Hello',
		})
		const partial = applyResolvers(entry, baseCollectionConfig, {}, CONTEXT)
		expect(partial.title).toBe('Hello')
		expect(partial.description).toBe('Lead-in text.')
		expect(partial.date).toEqual(new Date('2026-04-10T00:00:00Z'))
		expect(partial.content).toBe('<p>html</p>')
	})

	it('uses default category resolver to map tags to {name, term}', () => {
		const entry = makeEntry({
			date: new Date(),
			tags: ['Hello World', 'foo bar'],
			title: 'T',
		})
		const partial = applyResolvers(entry, baseCollectionConfig, {}, CONTEXT)
		expect(partial.category).toEqual([
			{ name: 'Hello World', term: 'hello-world' },
			{ name: 'foo bar', term: 'foo-bar' },
		])
	})

	it('lets top-level resolvers override defaults', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = applyResolvers(
			entry,
			baseCollectionConfig,
			{ title: () => 'top-level override' },
			CONTEXT,
		)
		expect(partial.title).toBe('top-level override')
	})

	it('lets per-collection resolvers override top-level resolvers', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = applyResolvers(
			entry,
			{ ...baseCollectionConfig, resolvers: { title: () => 'per-collection' } },
			{ title: () => 'top-level' },
			CONTEXT,
		)
		expect(partial.title).toBe('per-collection')
	})

	it('honors string-form resolvers (read field by name)', () => {
		const entry = makeEntry({ date: new Date(), summary: 'short blurb', title: 'T' })
		const partial = applyResolvers(
			entry,
			{ ...baseCollectionConfig, resolvers: { description: 'summary' } },
			{},
			CONTEXT,
		)
		expect(partial.description).toBe('short blurb')
	})

	it('honors object-form resolvers (transform from named field)', () => {
		const entry = makeEntry({ date: new Date(), raw: 'hello', title: 'T' })
		const partial = applyResolvers(
			entry,
			{
				...baseCollectionConfig,
				resolvers: {
					title: { from: 'raw', transform: (v) => `${String(v)} world` },
				},
			},
			{},
			CONTEXT,
		)
		expect(partial.title).toBe('hello world')
	})

	it('omits fields when resolver returns undefined', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = applyResolvers(
			entry,
			// eslint-disable-next-line ts/no-empty-function
			{ ...baseCollectionConfig, resolvers: { description() {} } },
			{},
			CONTEXT,
		)
		expect('description' in partial).toBe(false)
	})
})

describe('tagCategoryResolver', () => {
	it('builds category entries with domain URLs derived from basePath + siteUrl', () => {
		const resolver = tagCategoryResolver({ basePath: '/tags/' })
		const partial = applyResolvers(
			makeEntry({ date: new Date(), tags: ['Hello World'], title: 'T' }),
			{ ...baseCollectionConfig, resolvers: { category: resolver } },
			{},
			CONTEXT,
		)
		expect(partial.category).toEqual([
			{
				domain: 'https://example.com/tags/hello-world',
				name: 'Hello World',
				term: 'hello-world',
			},
		])
	})

	it('returns undefined when tags field is absent or empty', () => {
		const resolver = tagCategoryResolver({ basePath: '/tags/' })
		const partial = applyResolvers(
			makeEntry({ date: new Date(), tags: [], title: 'T' }),
			{ ...baseCollectionConfig, resolvers: { category: resolver } },
			{},
			CONTEXT,
		)
		expect('category' in partial).toBe(false)
	})
})
