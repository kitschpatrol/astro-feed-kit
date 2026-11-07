// End-to-end coverage: build the package, then build the fixture site in
// `test/fixtures/site/` with the real `astro build` CLI and assert on the
// generated feeds and page. This exercises what the unit tests mock out: the
// integration hooks inside Astro, renderer setup and `AstroContainer`
// rendering of real content entries, the `<FeedKit />` component, and the
// endpoints sharing one generation pass.
//
// `test/fixtures/site/` is built twice: once with its default config at the
// site root, and once with `astro.config.base.ts`, which sets `base: '/blog'`,
// `trailingSlash: 'never'`, a custom RSS filename, and disables Atom.
// `test/fixtures/site-i18n/` is built once: an Astro i18n site with English
// and French content folders and `i18n: true`.

import { parseHTML } from 'linkedom'
import { execFileSync } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_ROOT = fileURLToPath(new URL('fixtures/', import.meta.url))

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
	language?: string
	version: string
}

type Variant = 'base' | 'i18n' | 'root'

/** Which fixture directory each variant builds, and with which config file. */
const VARIANTS: Record<Variant, { config?: string; fixture: string }> = {
	base: { config: 'astro.config.base.ts', fixture: 'site' },
	i18n: { fixture: 'site-i18n' },
	root: { fixture: 'site' },
}

function fixtureDirectory(variant: Variant): string {
	return path.join(FIXTURES_ROOT, VARIANTS[variant].fixture)
}

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
	return readFile(path.join(fixtureDirectory(variant), 'dist', variant, file), 'utf8')
}

async function outputExists(variant: Variant, file: string): Promise<boolean> {
	try {
		await access(path.join(fixtureDirectory(variant), 'dist', variant, file))
		return true
	} catch {
		return false
	}
}

async function readJsonFeed(variant: Variant, file = 'feed.json'): Promise<JsonFeed> {
	return JSON.parse(await readOutput(variant, file)) as JsonFeed
}

async function alternateLinks(variant: Variant, page = 'index.html') {
	const { document } = parseHTML(await readOutput(variant, page))
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
	// The fixtures import `astro-feed-kit` by name, which resolves to `dist/`.
	runNodeScript(await binPath('tsdown'), [], REPO_ROOT)
	const astro = await binPath('astro')
	const variants = Object.keys(VARIANTS) as Variant[]
	const directories = new Set(variants.map((variant) => fixtureDirectory(variant)))
	for (const directory of directories) {
		await rm(path.join(directory, 'dist'), { force: true, recursive: true })
	}

	for (const variant of variants) {
		const { config } = VARIANTS[variant]
		const args = config === undefined ? ['build'] : ['build', '--config', config]
		runNodeScript(astro, args, fixtureDirectory(variant))
	}
}, 400_000)

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
		expect(feed.items.map((item) => item.title)).toEqual(['Teaser post', 'Full post', 'MDX post'])
	})

	it('gives components inside entries their permalink and the site, with no locale', async () => {
		const content = itemContent(await readJsonFeed('root'), 'MDX post')
		expect(content).toContain('Locale: none.')
		expect(content).toContain('Path: /posts/mdx-post/.')
		expect(content).toContain('Site host: example.com.')
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
			'https://example.com/blog/posts/mdx-post',
		])
		expect(itemContent(feed, 'Teaser post')).toContain(
			'<a href="https://example.com/blog/posts/teaser">Continue reading →</a>',
		)
	})

	it('gives components inside entries a permalink under base', async () => {
		expect(itemContent(await readJsonFeed('base'), 'MDX post')).toContain(
			'Path: /blog/posts/mdx-post.',
		)
	})
})

describe('e2e: fixture site with i18n', () => {
	it('writes every format for each locale, the default locale unprefixed', async () => {
		for (const file of [
			'rss.xml',
			'atom.xml',
			'feed.json',
			'fr/rss.xml',
			'fr/atom.xml',
			'fr/feed.json',
		]) {
			await expect(outputExists('i18n', file)).resolves.toBe(true)
		}
	})

	it('links each page to the feeds of its own locale, with localized titles', async () => {
		await expect(alternateLinks('i18n')).resolves.toEqual([
			{ href: '/rss.xml', title: 'Fixture', type: 'application/rss+xml' },
			{ href: '/atom.xml', title: 'Fixture', type: 'application/atom+xml' },
			{ href: '/feed.json', title: 'Fixture', type: 'application/feed+json' },
		])
		await expect(alternateLinks('i18n', 'fr/index.html')).resolves.toEqual([
			{ href: '/fr/rss.xml', title: 'Fixture (fr)', type: 'application/rss+xml' },
			{ href: '/fr/atom.xml', title: 'Fixture (fr)', type: 'application/atom+xml' },
			{ href: '/fr/feed.json', title: 'Fixture (fr)', type: 'application/feed+json' },
		])
	})

	it('fills the default locale feed from its folder and from the collection root', async () => {
		const feed = await readJsonFeed('i18n')
		expect(feed.items.map((item) => item.title)).toEqual([
			'Teaser post',
			'MDX post',
			'Full post',
			'Root post',
		])
		expect(feed.items.map((item) => item.url)).toEqual([
			'https://example.com/posts/teaser/',
			'https://example.com/posts/mdx-post/',
			'https://example.com/posts/full/',
			'https://example.com/posts/root/',
		])
		expect(feed.home_page_url).toBe('https://example.com/')
		expect(feed.feed_url).toBe('https://example.com/feed.json')
		expect(feed.language).toBe('en')
		expect(feed.version).toBe('https://jsonfeed.org/version/1.1')
	})

	it('fills the other locale feed from its folder only, under its prefix', async () => {
		const feed = await readJsonFeed('i18n', 'fr/feed.json')
		expect(feed.items.map((item) => item.title)).toEqual(['Teaser post (fr)', 'MDX post (fr)'])
		expect(feed.items[0]?.url).toBe('https://example.com/fr/posts/teaser/')
		expect(feed.home_page_url).toBe('https://example.com/fr/')
		expect(feed.feed_url).toBe('https://example.com/fr/feed.json')
		expect(feed.language).toBe('fr')
	})

	it('localizes the read-more link and resolves relative URLs under the locale', async () => {
		const content = itemContent(await readJsonFeed('i18n', 'fr/feed.json'), 'Teaser post (fr)')
		expect(content).toContain('<a href="https://example.com/fr/posts/about/">relative link</a>')
		expect(content).not.toContain('below the excerpt marker')
		expect(content).toContain('<a href="https://example.com/fr/posts/teaser/">Lire la suite</a>')
		const english = itemContent(await readJsonFeed('i18n'), 'Teaser post')
		expect(english).toContain('<a href="https://example.com/posts/teaser/">Continue reading →</a>')
	})

	it('gives components inside entries the locale of the feed being built', async () => {
		const french = itemContent(await readJsonFeed('i18n', 'fr/feed.json'), 'MDX post (fr)')
		expect(french).toContain('Locale: fr.')
		expect(french).toContain('Path: /fr/posts/mdx-post/.')
		expect(french).toContain('Site host: example.com.')
		const english = itemContent(await readJsonFeed('i18n'), 'MDX post')
		expect(english).toContain('Locale: en.')
		expect(english).toContain('Path: /posts/mdx-post/.')
	})

	it('writes the language into RSS and Atom with per-locale self links', async () => {
		await expect(readOutput('i18n', 'rss.xml')).resolves.toContain('<language>en</language>')
		const atom = await readOutput('i18n', 'fr/atom.xml')
		expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">')
		expect(atom).toContain('<link rel="self" href="https://example.com/fr/atom.xml"/>')
		expect(atom).toContain('<link rel="alternate" href="https://example.com/fr/"/>')
	})
})
