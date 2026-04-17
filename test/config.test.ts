import { describe, expect, it } from 'vitest'
import { defineFeedConfig, getFeedPath } from '../src/integration/config'

const baseInput = {
	contentCollections: [{ key: 'posts', link: () => 'https://example.com/posts/x' }],
	feedOptions: {
		description: 'd',
		link: 'https://example.com',
		title: 't',
	},
}

describe('defineFeedConfig', () => {
	it('applies default feeds (rss.xml / atom.xml / feed.json) and limit (25)', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.feeds).toEqual({
			atom: 'atom.xml',
			json: 'feed.json',
			rss: 'rss.xml',
		})
		expect(resolved.limit).toBe(25)
	})

	it('defaults excerptBoundary to {comment: "excerpt"}', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.excerptBoundary).toEqual({ comment: 'excerpt' })
	})

	it('defaults includeContent to true', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.includeContent).toBe(true)
	})

	it('respects user overrides for feeds, limit, excerptBoundary, includeContent', () => {
		const resolved = defineFeedConfig({
			...baseInput,
			excerptBoundary: false,
			feeds: { atom: 'a.xml', rss: 'r.xml' },
			includeContent: false,
			limit: 5,
		})
		expect(resolved.feeds.rss).toBe('r.xml')
		expect(resolved.feeds.atom).toBe('a.xml')
		expect(resolved.feeds.json).toBe('feed.json') // Default fills in missing
		expect(resolved.limit).toBe(5)
		expect(resolved.excerptBoundary).toBe(false)
		expect(resolved.includeContent).toBe(false)
	})

	it('populates feedLinks from siteLink when missing', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.feedOptions.feedLinks).toEqual({
			atom: 'https://example.com/atom.xml',
			json: 'https://example.com/feed.json',
			rss: 'https://example.com/rss.xml',
		})
	})

	it('handles trailing slash on siteLink without producing double slashes', () => {
		const resolved = defineFeedConfig({
			...baseInput,
			feedOptions: { ...baseInput.feedOptions, link: 'https://example.com/' },
		})
		expect(resolved.feedOptions.feedLinks?.rss).toBe('https://example.com/rss.xml')
	})

	it('preserves user-supplied feedLinks', () => {
		const resolved = defineFeedConfig({
			...baseInput,
			feedOptions: {
				...baseInput.feedOptions,
				feedLinks: { rss: 'https://elsewhere.com/feed.rss' },
			},
		})
		expect(resolved.feedOptions.feedLinks?.rss).toBe('https://elsewhere.com/feed.rss')
		// Gaps still get auto-filled
		expect(resolved.feedOptions.feedLinks?.atom).toBe('https://example.com/atom.xml')
	})

	it('defaults id and feed when missing, derived from siteLink', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.feedOptions.id).toBe('https://example.com')
		expect(resolved.feedOptions.feed).toBe('https://example.com/rss.xml')
	})

	it('defaults generator to "feed-kit"', () => {
		const resolved = defineFeedConfig(baseInput)
		expect(resolved.feedOptions.generator).toBe('feed-kit')
	})

	it('merges DEFAULT_KNOWN_RENDERERS with user-supplied list, deduped', () => {
		const resolved = defineFeedConfig({
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
		const resolved = defineFeedConfig(baseInput)
		expect(getFeedPath(resolved, 'rss')).toBe('/rss.xml')
		expect(getFeedPath(resolved, 'atom')).toBe('/atom.xml')
		expect(getFeedPath(resolved, 'json')).toBe('/feed.json')
	})

	it('reflects user-supplied feed filenames', () => {
		const resolved = defineFeedConfig({ ...baseInput, feeds: { rss: 'feed.rss' } })
		expect(getFeedPath(resolved, 'rss')).toBe('/feed.rss')
	})
})
