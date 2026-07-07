import { describe, expect, it } from 'vitest'
import type { SourceInput } from '../src/integration/config'
import { defaultItemSort, defineFeedKitConfig, getFeedPath } from '../src/integration/config'

const resolveItemFn = (): { link: string } => ({ link: 'https://example.com/posts/x' })

// Synthetic collection names ('posts', 'notes') used below live outside the
// project's real `CollectionKey` union. `Source`'s `collection` field narrows
// to that union, so descriptors must be cast through this helper. Behavior
// under test is config resolution, not Astro's collection-name typing.
function source(spec: Record<string, unknown> | string): SourceInput {
	return spec as unknown as SourceInput
}

const baseInput = {
	feedOptions: {
		description: 'd',
		link: 'https://example.com',
		title: 't',
	},
	sources: [source({ collection: 'posts', resolveItem: resolveItemFn })],
}

describe('defineFeedKitConfig', () => {
	it('applies default formats (rss.xml / atom.xml / feed.json) and limit (25)', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.formats).toEqual({
			atom: 'atom.xml',
			json: 'feed.json',
			rss: 'rss.xml',
		})
		expect(resolved.limit).toBe(25)
	})

	it('defaults excerptBoundary to false (full content)', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.excerptBoundary).toBe(false)
	})

	it('defaults includeContent to true', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.includeContent).toBe(true)
	})

	it('defaults sort to the built-in date-desc item sort', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.sort).toBe(defaultItemSort)
	})

	it('respects user overrides for formats, limit, excerptBoundary, includeContent', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			excerptBoundary: false,
			formats: { atom: 'a.xml', rss: 'r.xml' },
			includeContent: false,
			limit: 5,
		})
		expect(resolved.formats.rss).toBe('r.xml')
		expect(resolved.formats.atom).toBe('a.xml')
		expect(resolved.formats.json).toBe('feed.json') // Default fills in missing
		expect(resolved.limit).toBe(5)
		expect(resolved.excerptBoundary).toBe(false)
		expect(resolved.includeContent).toBe(false)
	})

	it('normalizes string source shorthand to {collection}', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			sources: [source('posts'), source('notes')],
		})
		expect(resolved.sources).toEqual([{ collection: 'posts' }, { collection: 'notes' }])
	})

	it('preserves object source descriptors', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			sources: [source({ collection: 'posts', limit: 5, resolveItem: resolveItemFn })],
		})
		expect(resolved.sources).toEqual([
			{ collection: 'posts', limit: 5, resolveItem: resolveItemFn },
		])
	})

	it('accepts a mix of string and descriptor sources', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			sources: [source('posts'), source({ collection: 'notes', limit: 10 })],
		})
		expect(resolved.sources).toEqual([{ collection: 'posts' }, { collection: 'notes', limit: 10 }])
	})

	it('derives feedLinks from siteLink and formats', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.feedOptions.feedLinks).toEqual({
			atom: 'https://example.com/atom.xml',
			json: 'https://example.com/feed.json',
			rss: 'https://example.com/rss.xml',
		})
	})

	it('reflects custom format filenames in derived feedLinks', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			formats: { rss: 'feed.xml' },
		})
		expect(resolved.feedOptions.feedLinks?.rss).toBe('https://example.com/feed.xml')
		expect(resolved.feedOptions.feed).toBe('https://example.com/feed.xml')
	})

	it('handles trailing slash on siteLink without producing double slashes', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			feedOptions: { ...baseInput.feedOptions, link: 'https://example.com/' },
		})
		expect(resolved.feedOptions.feedLinks?.rss).toBe('https://example.com/rss.xml')
	})

	it('defaults id from siteLink and derives feed from siteLink + formats.rss', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(resolved.feedOptions.id).toBe('https://example.com')
		expect(resolved.feedOptions.feed).toBe('https://example.com/rss.xml')
	})

	it('omits feedLinks, feed, and id when siteLink is absent', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			feedOptions: { description: 'd', title: 't' },
		})
		expect(resolved.feedOptions.feedLinks).toBeUndefined()
		expect(resolved.feedOptions.feed).toBeUndefined()
		expect(resolved.feedOptions.id).toBeUndefined()
	})

	it('disables a feed format when formats[kind] is false', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			formats: { atom: false, rss: 'feed.xml' },
		})
		expect(resolved.formats.atom).toBeUndefined()
		expect(resolved.formats.rss).toBe('feed.xml')
		expect(resolved.formats.json).toBe('feed.json')
		expect(resolved.feedOptions.feedLinks?.atom).toBeUndefined()
		expect(resolved.feedOptions.feedLinks?.rss).toBe('https://example.com/feed.xml')
		expect(resolved.feedOptions.feedLinks?.json).toBe('https://example.com/feed.json')
	})

	it('treats formats[kind] === true as the default filename', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			formats: { atom: true, rss: true },
		})
		expect(resolved.formats.atom).toBe('atom.xml')
		expect(resolved.formats.rss).toBe('rss.xml')
	})

	it('omits feedOptions.feed when rss is disabled', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			formats: { rss: false },
		})
		expect(resolved.formats.rss).toBeUndefined()
		expect(resolved.feedOptions.feed).toBeUndefined()
		expect(resolved.feedOptions.feedLinks?.rss).toBeUndefined()
	})

	it('merges DEFAULT_KNOWN_RENDERERS with user-supplied list, deduped', () => {
		const resolved = defineFeedKitConfig({
			...baseInput,
			knownRenderers: ['@astrojs/mdx', 'custom-renderer'],
		})
		expect(resolved.knownRenderers).toContain('@astrojs/mdx')
		expect(resolved.knownRenderers).toContain('custom-renderer')
		const mdxOccurrences = resolved.knownRenderers.filter((r) => r === '@astrojs/mdx').length
		expect(mdxOccurrences).toBe(1)
	})
})

describe('getFeedPath', () => {
	it('returns the configured filename prefixed with /', () => {
		const resolved = defineFeedKitConfig(baseInput)
		expect(getFeedPath(resolved, 'rss')).toBe('/rss.xml')
		expect(getFeedPath(resolved, 'atom')).toBe('/atom.xml')
		expect(getFeedPath(resolved, 'json')).toBe('/feed.json')
	})

	it('reflects user-supplied feed filenames', () => {
		const resolved = defineFeedKitConfig({ ...baseInput, formats: { rss: 'feed.rss' } })
		expect(getFeedPath(resolved, 'rss')).toBe('/feed.rss')
	})

	it('returns undefined for disabled formats', () => {
		const resolved = defineFeedKitConfig({ ...baseInput, formats: { json: false } })
		expect(getFeedPath(resolved, 'json')).toBeUndefined()
		expect(getFeedPath(resolved, 'rss')).toBe('/rss.xml')
	})
})
