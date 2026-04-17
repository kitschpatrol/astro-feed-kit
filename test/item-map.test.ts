/* eslint-disable ts/no-unsafe-type-assertion */
import type { CollectionEntry, CollectionKey } from 'astro:content'
import { describe, expect, it } from 'vitest'
import type { ResolverContext } from '../src/integration/config'
import { defaultResolve, resolveItem, tagCategoryResolver } from '../src/integration/item-map'

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

describe('defaultResolve', () => {
	it('populates title/date/description/content from common frontmatter fields', () => {
		const entry = makeEntry({
			date: new Date('2026-04-10T00:00:00Z'),
			description: 'Lead-in text.',
			title: 'Hello',
		})
		const partial = defaultResolve(entry, CONTEXT)
		expect(partial.title).toBe('Hello')
		expect(partial.description).toBe('Lead-in text.')
		expect(partial.date).toEqual(new Date('2026-04-10T00:00:00Z'))
		expect(partial.published).toEqual(new Date('2026-04-10T00:00:00Z'))
		expect(partial.content).toBe('<p>html</p>')
	})

	it('maps tags to {name, term} categories using default slug form', () => {
		const entry = makeEntry({
			date: new Date(),
			tags: ['Hello World', 'foo bar'],
			title: 'T',
		})
		const partial = defaultResolve(entry, CONTEXT)
		expect(partial.category).toEqual([
			{ name: 'Hello World', term: 'hello-world' },
			{ name: 'foo bar', term: 'foo-bar' },
		])
	})

	it('omits category when tags field is absent or empty', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = defaultResolve(entry, CONTEXT)
		expect('category' in partial).toBe(false)
	})

	it('omits content when renderedHtml is empty (includeContent: false mode)', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = defaultResolve(entry, { ...CONTEXT, renderedHtml: '' })
		expect('content' in partial).toBe(false)
	})
})

describe('resolveItem', () => {
	it('returns the default baseline when no per-source resolve is provided', () => {
		const entry = makeEntry({
			date: new Date('2026-04-10T00:00:00Z'),
			description: 'Lead-in text.',
			title: 'Hello',
		})
		const partial = resolveItem(entry, CONTEXT)
		expect(partial.title).toBe('Hello')
		expect(partial.description).toBe('Lead-in text.')
	})

	it('lets per-source resolve override default fields', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		const partial = resolveItem(entry, CONTEXT, () => ({ title: 'overridden' }))
		expect(partial.title).toBe('overridden')
	})

	it('merges fields the user sets with defaults left untouched', () => {
		const entry = makeEntry({
			date: new Date('2026-04-10T00:00:00Z'),
			summary: 'short blurb',
			title: 'T',
		})
		const partial = resolveItem(entry, CONTEXT, (innerEntry) => ({
			description: (innerEntry.data as Record<string, unknown>).summary as string,
		}))
		expect(partial.title).toBe('T')
		expect(partial.description).toBe('short blurb')
		expect(partial.date).toEqual(new Date('2026-04-10T00:00:00Z'))
	})

	it('skips undefined values from per-source resolve so defaults survive', () => {
		const entry = makeEntry({
			date: new Date(),
			description: 'default desc',
			title: 'T',
		})
		const partial = resolveItem(entry, CONTEXT, () => ({ description: undefined }))
		expect(partial.description).toBe('default desc')
	})

	it('passes entry and context through to the per-source resolve', () => {
		const entry = makeEntry({ date: new Date(), title: 'T' })
		let received: undefined | { context: ResolverContext; entry: unknown }
		resolveItem(entry, CONTEXT, (innerEntry, innerContext) => {
			received = { context: innerContext, entry: innerEntry }
			return {}
		})
		expect(received?.entry).toBe(entry)
		expect(received?.context).toBe(CONTEXT)
	})
})

describe('tagCategoryResolver', () => {
	it('produces {category} with domain URLs built from basePath and siteUrl', () => {
		const build = tagCategoryResolver({ basePath: '/tags/' })
		const entry = makeEntry({ date: new Date(), tags: ['Hello World'], title: 'T' })
		const result = build(entry, CONTEXT)
		expect(result).toEqual({
			category: [
				{
					domain: 'https://example.com/tags/hello-world',
					name: 'Hello World',
					term: 'hello-world',
				},
			],
		})
	})

	it('returns an empty object when tags are absent or empty', () => {
		const build = tagCategoryResolver({ basePath: '/tags/' })
		const entryWithoutTags = makeEntry({ date: new Date(), title: 'T' })
		expect(build(entryWithoutTags, CONTEXT)).toEqual({})
		const entryWithEmptyTags = makeEntry({ date: new Date(), tags: [], title: 'T' })
		expect(build(entryWithEmptyTags, CONTEXT)).toEqual({})
	})

	it('spreads cleanly inside a source resolve to replace the default categories', () => {
		const entry = makeEntry({ date: new Date(), tags: ['Foo'], title: 'T' })
		const partial = resolveItem(entry, CONTEXT, (innerEntry, innerContext) => ({
			...tagCategoryResolver({ basePath: '/tags/' })(innerEntry, innerContext),
		}))
		expect(partial.category).toEqual([
			{
				domain: 'https://example.com/tags/foo',
				name: 'Foo',
				term: 'foo',
			},
		])
	})
})
