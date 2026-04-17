/* eslint-disable ts/no-unsafe-type-assertion */
import type { CollectionEntry, CollectionKey } from 'astro:content'
import { describe, expect, it } from 'vitest'
import type { ItemResolverArgs } from '../src/integration/config'
import {
	defaultItemResolver,
	resolveItemFields,
	tagCategoryResolver,
} from '../src/integration/item-map'

const SITE_URL = 'https://example.com/'

function makeEntry(data: Record<string, unknown>): CollectionEntry<CollectionKey> {
	return {
		body: '',
		collection: 'posts',
		data,
		id: 'sample',
	} as unknown as CollectionEntry<CollectionKey>
}

function makeArgs(data: Record<string, unknown>): ItemResolverArgs {
	return { entry: makeEntry(data), siteUrl: SITE_URL }
}

describe('defaultItemResolver', () => {
	it('populates title/date/description from common frontmatter fields', () => {
		const partial = defaultItemResolver(
			makeArgs({
				date: new Date('2026-04-10T00:00:00Z'),
				description: 'Lead-in text.',
				title: 'Hello',
			}),
		)
		expect(partial.title).toBe('Hello')
		expect(partial.description).toBe('Lead-in text.')
		expect(partial.date).toEqual(new Date('2026-04-10T00:00:00Z'))
		expect(partial.published).toEqual(new Date('2026-04-10T00:00:00Z'))
	})

	it('derives the default link from siteUrl, collection, and entry.id', () => {
		const partial = defaultItemResolver(makeArgs({ date: new Date(), title: 'T' }))
		expect(partial.link).toBe('https://example.com/posts/sample/')
	})

	it('never sets content — the pipeline fills it from the sanitized render', () => {
		const partial = defaultItemResolver(makeArgs({ date: new Date(), title: 'T' }))
		expect('content' in partial).toBe(false)
	})

	it('maps tags to {name, term} categories using default slug form', () => {
		const partial = defaultItemResolver(
			makeArgs({
				date: new Date(),
				tags: ['Hello World', 'foo bar'],
				title: 'T',
			}),
		)
		expect(partial.category).toEqual([
			{ name: 'Hello World', term: 'hello-world' },
			{ name: 'foo bar', term: 'foo-bar' },
		])
	})

	it('omits category when tags field is absent or empty', () => {
		const partial = defaultItemResolver(makeArgs({ date: new Date(), title: 'T' }))
		expect('category' in partial).toBe(false)
	})
})

describe('resolveItemFields', () => {
	it('returns the default baseline when no per-source resolveItem is provided', () => {
		const partial = resolveItemFields(
			makeArgs({
				date: new Date('2026-04-10T00:00:00Z'),
				description: 'Lead-in text.',
				title: 'Hello',
			}),
		)
		expect(partial.title).toBe('Hello')
		expect(partial.description).toBe('Lead-in text.')
	})

	it('lets per-source resolveItem override default fields', () => {
		const partial = resolveItemFields(makeArgs({ date: new Date(), title: 'T' }), () => ({
			title: 'overridden',
		}))
		expect(partial.title).toBe('overridden')
	})

	it('lets per-source resolveItem override the default link', () => {
		const partial = resolveItemFields(makeArgs({ date: new Date(), title: 'T' }), ({ entry }) => ({
			link: `https://example.com/custom/${entry.id}/`,
		}))
		expect(partial.link).toBe('https://example.com/custom/sample/')
	})

	it('merges fields the user sets with defaults left untouched', () => {
		const partial = resolveItemFields(
			makeArgs({
				date: new Date('2026-04-10T00:00:00Z'),
				summary: 'short blurb',
				title: 'T',
			}),
			({ entry }) => ({
				description: (entry.data as Record<string, unknown>).summary as string,
			}),
		)
		expect(partial.title).toBe('T')
		expect(partial.description).toBe('short blurb')
		expect(partial.date).toEqual(new Date('2026-04-10T00:00:00Z'))
	})

	it('skips undefined values from per-source resolveItem so defaults survive', () => {
		const partial = resolveItemFields(
			makeArgs({
				date: new Date(),
				description: 'default desc',
				title: 'T',
			}),
			() => ({ description: undefined }),
		)
		expect(partial.description).toBe('default desc')
	})

	it('passes the args object through to the per-source resolveItem', () => {
		const args = makeArgs({ date: new Date(), title: 'T' })
		let received: ItemResolverArgs | undefined
		resolveItemFields(args, (innerArgs) => {
			received = innerArgs
			return {}
		})
		expect(received).toBe(args)
	})
})

describe('tagCategoryResolver', () => {
	it('produces {category} with domain URLs built from basePath and siteUrl', () => {
		const build = tagCategoryResolver({ basePath: '/tags/' })
		const result = build(makeArgs({ date: new Date(), tags: ['Hello World'], title: 'T' }))
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
		expect(build(makeArgs({ date: new Date(), title: 'T' }))).toEqual({})
		expect(build(makeArgs({ date: new Date(), tags: [], title: 'T' }))).toEqual({})
	})

	it('spreads cleanly inside a source resolveItem to replace the default categories', () => {
		const partial = resolveItemFields(
			makeArgs({ date: new Date(), tags: ['Foo'], title: 'T' }),
			(args) => ({
				...tagCategoryResolver({ basePath: '/tags/' })(args),
			}),
		)
		expect(partial.category).toEqual([
			{
				domain: 'https://example.com/tags/foo',
				name: 'Foo',
				term: 'foo',
			},
		])
	})
})
