// The injected endpoints share `loadFeed`. `virtual:astro-feed-kit/config`
// and `astro:content` only exist inside a running Astro project, so both are
// mocked; counting `getCollection` calls shows how many generation passes ran.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { loadFeed as LoadFeed } from '../src/internal/load-feed'

type FakeEntry = { collection: string; data: Record<string, unknown>; id: string }

const { getCollection } = vi.hoisted(() => {
	const entries: FakeEntry[] = [
		{ collection: 'posts', data: { date: new Date('2026-01-01'), title: 'P1' }, id: 'p1' },
		{ collection: 'posts', data: { date: new Date('2026-01-02'), title: 'P2' }, id: 'fr/p2' },
	]
	return {
		getCollection: vi.fn((_name: string, filter?: (entry: FakeEntry) => boolean) =>
			filter === undefined ? entries : entries.filter((entry) => filter(entry)),
		),
	}
})

vi.mock('astro:content', () => ({ getCollection }))

/** Mock the virtual config module for one test, then import a fresh `loadFeed`. */
async function importLoadFeed(options: { i18n: boolean }): Promise<typeof LoadFeed> {
	vi.doMock('virtual:astro-feed-kit/config', async () => {
		const { defineFeedKitConfig } = await import('../src/integration/config')
		return {
			default: defineFeedKitConfig(
				{
					feedOptions: { description: 'd', title: 't' },
					i18n: options.i18n,
					includeContent: false,
					sources: ['posts'],
				},
				{ i18n: { defaultLocale: 'en', locales: ['en', 'fr'] }, site: 'https://example.com' },
			),
		}
	})
	const { loadFeed } = await import('../src/internal/load-feed')
	return loadFeed
}

beforeEach(() => {
	vi.resetModules()
	getCollection.mockClear()
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.doUnmock('virtual:astro-feed-kit/config')
})

describe('loadFeed', () => {
	it('generates the feed once per build and shares it across format endpoints', async () => {
		vi.stubEnv('DEV', false)
		const loadFeed = await importLoadFeed({ i18n: false })

		const [rss, atom, json] = await Promise.all([
			loadFeed('/rss.xml'),
			loadFeed('/atom.xml'),
			loadFeed('/feed.json'),
		])

		expect(getCollection).toHaveBeenCalledTimes(1)
		expect(atom).toBe(rss)
		expect(json).toBe(rss)
		expect(rss.items.map((item) => item.title)).toEqual(['P2', 'P1'])
	})

	it('regenerates the feed on every dev request', async () => {
		vi.stubEnv('DEV', true)
		const loadFeed = await importLoadFeed({ i18n: false })

		const first = await loadFeed('/rss.xml')
		const second = await loadFeed('/rss.xml')

		expect(getCollection).toHaveBeenCalledTimes(2)
		expect(second).not.toBe(first)
	})
})

describe('loadFeed with i18n', () => {
	it('builds one feed per locale, picked by route pattern and shared across formats', async () => {
		vi.stubEnv('DEV', false)
		const loadFeed = await importLoadFeed({ i18n: true })

		const [enRss, enAtom, frRss, frJson] = await Promise.all([
			loadFeed('/rss.xml'),
			loadFeed('/atom.xml'),
			loadFeed('/fr/rss.xml'),
			loadFeed('/fr/feed.json'),
		])

		expect(getCollection).toHaveBeenCalledTimes(2)
		expect(enAtom).toBe(enRss)
		expect(frJson).toBe(frRss)
		expect(frRss).not.toBe(enRss)
		expect(enRss.items.map((item) => item.title)).toEqual(['P1'])
		expect(enRss.options.language).toBe('en')
		expect(frRss.items.map((item) => item.title)).toEqual(['P2'])
		expect(frRss.options.language).toBe('fr')
		expect(frRss.options.link).toBe('https://example.com/fr/')
	})

	it('fails for a route no locale was mounted at', async () => {
		vi.stubEnv('DEV', false)
		const loadFeed = await importLoadFeed({ i18n: true })
		await expect(loadFeed('/de/rss.xml')).rejects.toThrow(
			'no feed is configured for the route /de/rss.xml',
		)
	})
})
