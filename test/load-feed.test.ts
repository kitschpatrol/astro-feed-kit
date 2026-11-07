// The injected endpoints share `loadFeed`. `virtual:astro-feed-kit/config`
// and `astro:content` only exist inside a running Astro project, so both are
// mocked; counting `getCollection` calls shows how many generation passes ran.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { loadFeed as LoadFeed } from '../src/internal/load-feed'

const { getCollection } = vi.hoisted(() => ({
	getCollection: vi.fn(() => [
		{ collection: 'posts', data: { date: new Date('2026-01-01'), title: 'P1' }, id: 'p1' },
	]),
}))

vi.mock('astro:content', () => ({ getCollection }))

vi.mock('virtual:astro-feed-kit/config', async () => {
	const { defineFeedKitConfig } = await import('../src/integration/config')
	return {
		default: defineFeedKitConfig({
			feedOptions: { description: 'd', link: 'https://example.com', title: 't' },
			includeContent: false,
			sources: ['posts'],
		}),
	}
})

async function importLoadFeed(): Promise<typeof LoadFeed> {
	const { loadFeed } = await import('../src/internal/load-feed')
	return loadFeed
}

beforeEach(() => {
	vi.resetModules()
	getCollection.mockClear()
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('loadFeed', () => {
	it('generates the feed once per build and shares it across format endpoints', async () => {
		vi.stubEnv('DEV', false)
		const loadFeed = await importLoadFeed()

		const [rss, atom, json] = await Promise.all([loadFeed(), loadFeed(), loadFeed()])

		expect(getCollection).toHaveBeenCalledTimes(1)
		expect(atom).toBe(rss)
		expect(json).toBe(rss)
		expect(rss.items.map((item) => item.title)).toEqual(['P1'])
	})

	it('regenerates the feed on every dev request', async () => {
		vi.stubEnv('DEV', true)
		const loadFeed = await importLoadFeed()

		const first = await loadFeed()
		const second = await loadFeed()

		expect(getCollection).toHaveBeenCalledTimes(2)
		expect(second).not.toBe(first)
	})
})
