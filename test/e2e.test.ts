// End-to-end coverage: build the package, then build the fixture site in
// `test/fixtures/site/` with the real `astro build` CLI and assert on the
// generated feeds and page. This exercises what the unit tests mock out: the
// integration hooks inside Astro, renderer setup and `AstroContainer`
// rendering of real content entries, the `<FeedKit />` component, and the
// endpoints sharing one generation pass.
//
// The fixture is built twice: once with its default config at the site root,
// and once with `astro.config.base.ts`, which sets `base: '/blog'`,
// `trailingSlash: 'never'`, a custom RSS filename, and disables Atom.

import { parseHTML } from 'linkedom'
import { execFileSync } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const FIXTURE_ROOT = fileURLToPath(new URL('fixtures/site/', import.meta.url))

type JsonFeed = {
	// eslint-disable-next-line ts/naming-convention -- JSON Feed field names are snake_case
	feed_url?: string
	// eslint-disable-next-line ts/naming-convention -- JSON Feed field names are snake_case
	home_page_url?: string
	items: Array<{
		// eslint-disable-next-line ts/naming-convention -- JSON Feed field names are snake_case
		content_html?: string
		tags?: string[]
		title: string
		url: string
	}>
}

type Variant = 'base' | 'root'

/** Absolute path to a package's CLI script, read from its `bin` field. */
async function binPath(packageName: string): Promise<string> {
	const packageDirectory = path.join(REPO_ROOT, 'node_modules', packageName)
	const manifest = JSON.parse(
		await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
	) as { bin: Record<string, string> }
	const bin = manifest.bin[packageName]
	if (bin === undefined) {
		throw new Error(`No "${packageName}" bin in ${packageName}/package.json`)
	}

	return path.join(packageDirectory, bin)
}

/**
 * Run a Node CLI script without the variables Vitest sets, so the child runs
 * like a build started from a terminal (`NODE_ENV=test` would put Vite into
 * development mode).
 */
function runNodeScript(script: string, args: string[], cwd: string): void {
	const env: NodeJS.ProcessEnv = {}
	for (const [key, value] of Object.entries(process.env)) {
		if (key !== 'NODE_ENV' && key !== 'TEST' && !key.startsWith('VITEST')) {
			env[key] = value
		}
	}

	env.ASTRO_TELEMETRY_DISABLED = '1'

	try {
		execFileSync(process.execPath, [script, ...args], {
			cwd,
			env,
			maxBuffer: 16 * 1024 * 1024,
			stdio: 'pipe',
		})
	} catch (error) {
		const output =
			typeof error === 'object' && error !== null && 'stderr' in error && 'stdout' in error
				? `${String(error.stdout)}\n${String(error.stderr)}`
				: String(error)
		throw new Error(`\`${path.basename(script)} ${args.join(' ')}\` failed in ${cwd}:\n${output}`, {
			cause: error,
		})
	}
}

async function readOutput(variant: Variant, file: string): Promise<string> {
	return readFile(path.join(FIXTURE_ROOT, 'dist', variant, file), 'utf8')
}

async function outputExists(variant: Variant, file: string): Promise<boolean> {
	try {
		await access(path.join(FIXTURE_ROOT, 'dist', variant, file))
		return true
	} catch {
		return false
	}
}

async function readJsonFeed(variant: Variant): Promise<JsonFeed> {
	return JSON.parse(await readOutput(variant, 'feed.json')) as JsonFeed
}

async function alternateLinks(variant: Variant) {
	const { document } = parseHTML(await readOutput(variant, 'index.html'))
	return Array.from(document.querySelectorAll('link[rel="alternate"]'), (link) => ({
		href: link.getAttribute('href'),
		title: link.getAttribute('title'),
		type: link.getAttribute('type'),
	}))
}

function itemContent(feed: JsonFeed, title: string): string {
	const item = feed.items.find((candidate) => candidate.title === title)
	if (item?.content_html === undefined) {
		throw new Error(`No content for "${title}" in ${JSON.stringify(feed.items)}`)
	}

	return item.content_html
}

beforeAll(async () => {
	// The fixture imports `astro-feed-kit` by name, which resolves to `dist/`.
	runNodeScript(await binPath('tsdown'), [], REPO_ROOT)
	await rm(path.join(FIXTURE_ROOT, 'dist'), { force: true, recursive: true })
	const astro = await binPath('astro')
	runNodeScript(astro, ['build'], FIXTURE_ROOT)
	runNodeScript(astro, ['build', '--config', 'astro.config.base.ts'], FIXTURE_ROOT)
}, 300_000)

describe('e2e: fixture site at the root', () => {
	it('writes all three feed formats', async () => {
		for (const file of ['rss.xml', 'atom.xml', 'feed.json']) {
			await expect(outputExists('root', file)).resolves.toBe(true)
		}
	})

	it('renders a <FeedKit /> link tag for each format', async () => {
		await expect(alternateLinks('root')).resolves.toEqual([
			{ href: '/rss.xml', title: 'Fixture', type: 'application/rss+xml' },
			{ href: '/atom.xml', title: 'Fixture', type: 'application/atom+xml' },
			{ href: '/feed.json', title: 'Fixture', type: 'application/feed+json' },
		])
	})

	it('leaves out drafts and lists the newest post first', async () => {
		const feed = await readJsonFeed('root')
		expect(feed.items.map((item) => item.title)).toEqual(['Teaser post', 'Full post'])
	})

	it('renders the full body of entries without an excerpt marker', async () => {
		const content = itemContent(await readJsonFeed('root'), 'Full post')
		expect(content).toContain('its whole body reaches the feed')
		expect(content).toContain('<h2>A second section</h2>')
		expect(content).toContain('The second section is part of the feed content too.')
	})

	it('truncates at the excerpt marker and links to the full post', async () => {
		const content = itemContent(await readJsonFeed('root'), 'Teaser post')
		expect(content).toContain('This paragraph is above the excerpt marker')
		expect(content).not.toContain('below the excerpt marker')
		expect(content).toContain('<a href="https://example.com/posts/teaser/">Continue reading →</a>')
	})

	it('resolves relative URLs in content against the item link', async () => {
		const content = itemContent(await readJsonFeed('root'), 'Teaser post')
		expect(content).toContain('<a href="https://example.com/posts/about/">relative link</a>')
		expect(content).toContain('<img src="https://example.com/tiger.svg" alt="A tiger">')
	})

	it('builds item links, tags, and self links from the site URL', async () => {
		const feed = await readJsonFeed('root')
		expect(feed.home_page_url).toBe('https://example.com/')
		expect(feed.feed_url).toBe('https://example.com/feed.json')
		expect(feed.items[0]).toMatchObject({
			tags: ['Fixtures'],
			url: 'https://example.com/posts/teaser/',
		})
		await expect(readOutput('root', 'rss.xml')).resolves.toContain(
			'<atom:link href="https://example.com/rss.xml" rel="self" type="application/rss+xml"/>',
		)
		await expect(readOutput('root', 'atom.xml')).resolves.toContain(
			'<link rel="self" href="https://example.com/atom.xml"/>',
		)
	})
})

describe('e2e: fixture site with base, trailingSlash never, and custom formats', () => {
	it('writes only the enabled formats, using the custom RSS filename', async () => {
		await expect(outputExists('base', 'feed.xml')).resolves.toBe(true)
		await expect(outputExists('base', 'feed.json')).resolves.toBe(true)
		await expect(outputExists('base', 'rss.xml')).resolves.toBe(false)
		await expect(outputExists('base', 'atom.xml')).resolves.toBe(false)
	})

	it('prefixes <FeedKit /> link tags with base and omits the disabled format', async () => {
		await expect(alternateLinks('base')).resolves.toEqual([
			{ href: '/blog/feed.xml', title: 'Fixture', type: 'application/rss+xml' },
			{ href: '/blog/feed.json', title: 'Fixture', type: 'application/feed+json' },
		])
	})

	it('builds self links under base', async () => {
		const feed = await readJsonFeed('base')
		expect(feed.home_page_url).toBe('https://example.com/blog/')
		expect(feed.feed_url).toBe('https://example.com/blog/feed.json')
		await expect(readOutput('base', 'feed.xml')).resolves.toContain(
			'<atom:link href="https://example.com/blog/feed.xml" rel="self" type="application/rss+xml"/>',
		)
	})

	it('builds item and read-more links under base without trailing slashes', async () => {
		const feed = await readJsonFeed('base')
		expect(feed.items.map((item) => item.url)).toEqual([
			'https://example.com/blog/posts/teaser',
			'https://example.com/blog/posts/full',
		])
		expect(itemContent(feed, 'Teaser post')).toContain(
			'<a href="https://example.com/blog/posts/teaser">Continue reading →</a>',
		)
	})
})
