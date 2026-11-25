// The `feed` library writes `language` only into RSS. `serializeFeed` fills
// the Atom and JSON Feed gaps; these tests pin what it adds, what it leaves
// alone, and what it refuses.

import type { FeedOptions } from 'feed'
import { Feed } from 'feed'
import { describe, expect, it, vi } from 'vitest'
import { serializeFeed } from '../src/integration/serialize'

function makeFeed(language?: string): Feed {
	const options: FeedOptions = {
		copyright: 'c',
		description: 'd',
		feedLinks: {
			atom: 'https://example.com/atom.xml',
			json: 'https://example.com/feed.json',
			rss: 'https://example.com/rss.xml',
		},
		id: 'https://example.com/',
		link: 'https://example.com/',
		title: 't',
		updated: new Date('2026-01-01T00:00:00Z'),
	}
	if (language !== undefined) {
		options.language = language
	}

	const feed = new Feed(options)
	feed.addItem({
		date: new Date('2026-01-01T00:00:00Z'),
		link: 'https://example.com/p/',
		title: 'P',
	})
	return feed
}

type JsonFeed = Record<string, unknown> & { items: unknown[]; version: string }

describe('serializeFeed with a language', () => {
	const feed = makeFeed('pt-BR')

	it('writes xml:lang on the Atom <feed> element', () => {
		const atom = serializeFeed(feed, 'atom')
		expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="pt-BR">')
		expect(atom.match(/xml:lang/gv)).toHaveLength(1)
	})

	it('adds language to JSON Feed and declares version 1.1, keeping items last', () => {
		const parsed = JSON.parse(serializeFeed(feed, 'json')) as JsonFeed
		expect(parsed.language).toBe('pt-BR')
		expect(parsed.version).toBe('https://jsonfeed.org/version/1.1')
		const keys = Object.keys(parsed)
		expect(keys[0]).toBe('version')
		expect(keys.indexOf('language')).toBeLessThan(keys.indexOf('items'))
		expect(keys.at(-1)).toBe('items')
		expect(parsed.items).toHaveLength(1)
	})

	it('leaves RSS to the feed library, which already writes <language>', () => {
		const rss = serializeFeed(feed, 'rss')
		expect(rss).toBe(feed.rss2())
		expect(rss).toContain('<language>pt-BR</language>')
	})

	it('keeps an xml:lang the feed library already wrote', () => {
		const upstream =
			'<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="de">\n</feed>'
		vi.spyOn(feed, 'atom1').mockReturnValueOnce(upstream)
		expect(serializeFeed(feed, 'atom')).toBe(upstream)
	})

	it('keeps a JSON language the feed library already wrote', () => {
		const upstream = JSON.stringify({ items: [], language: 'de', title: 't', version: 'x' })
		vi.spyOn(feed, 'json1').mockReturnValueOnce(upstream)
		expect(serializeFeed(feed, 'json')).toBe(upstream)
	})

	it('fails when the Atom output has no <feed> element', () => {
		vi.spyOn(feed, 'atom1').mockReturnValueOnce('<rss version="2.0"/>')
		expect(() => serializeFeed(feed, 'atom')).toThrow('no <feed> element found')
	})

	it('rejects a language that is not a language tag', () => {
		expect(() => serializeFeed(makeFeed('fr"'), 'atom')).toThrow('is not a language tag')
		expect(() => serializeFeed(makeFeed('en us'), 'json')).toThrow('is not a language tag')
	})
})

describe('serializeFeed without a language', () => {
	const feed = makeFeed()

	it('returns the feed library output unchanged', () => {
		expect(serializeFeed(feed, 'atom')).toBe(feed.atom1())
		expect(serializeFeed(feed, 'json')).toBe(feed.json1())
		expect(serializeFeed(feed, 'rss')).toBe(feed.rss2())
	})

	it('adds no language markers and keeps JSON Feed at version 1', () => {
		expect(serializeFeed(feed, 'atom')).not.toContain('xml:lang')
		const parsed = JSON.parse(serializeFeed(feed, 'json')) as JsonFeed
		expect(parsed.version).toBe('https://jsonfeed.org/version/1')
		expect('language' in parsed).toBe(false)
	})
})
