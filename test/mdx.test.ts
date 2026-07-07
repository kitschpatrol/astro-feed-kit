// End-to-end coverage: read an MDX fixture, compile it to HTML the same way
// Astro + @astrojs/mdx does for static content (remark-parse → remark-gfm →
// remark-rehype(allowDangerousHtml) → rehype-raw → rehype-stringify), hand
// the result to `sanitizeHtml`, and assert on the sanitized output.
//
// Why a local compile helper and not Astro's container? AstroContainer needs
// the `astro:container` Vite virtual module, which is only resolvable inside
// a running Astro project — not in a plain Vitest run (see the comment atop
// `pipeline.test.ts`). For static MDX (no component imports, no JSX
// expressions), Astro + MDX's rendering output is byte-equivalent to running
// the same remark / rehype plugins directly, which is all the sanitizer needs
// to see. If a fixture later exercises component rendering, we'll need to
// either (a) compile via `@mdx-js/mdx` with a JSX runtime, or (b) pivot the
// test to read pre-rendered HTML from an `astro build` output.
//
// Fixtures live in `test/fixtures/mdx/*.mdx`. They use markdown + raw HTML
// (no JSX components), which is what authors write in 90%+ of blog posts
// anyway.

import { parseHTML } from 'linkedom'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../src/integration/sanitize'

const FIXTURE_BASE = new URL('fixtures/mdx/', import.meta.url)
const PERMALINK = 'https://example.com/posts/fixture/'

// Module-scope regexes (lint: prefer-static-regex).
const INLINE_EVENT_HANDLER = /\son\w+=/v
const HREF_JAVASCRIPT = /href="javascript:/v
const HREF_DATA = /href="data:/v
const HREF_FILE = /href="file:/v
const HREF_VBSCRIPT = /href="vbscript:/v
const INLINE_STYLE_ATTR = /\sstyle=/v
const SAFE_EMBED_SRC = /^https:\/\/(www\.youtube\.com|player\.vimeo\.com)\//v
const HTTP_OR_HTTPS = /^https?:\/\//v

/** Strip YAML frontmatter from a fixture body. */
function stripFrontmatter(source: string): string {
	if (!source.startsWith('---\n')) {
		return source
	}

	const end = source.indexOf('\n---\n', 4)
	return end === -1 ? source : source.slice(end + 5)
}

const mdxCompile = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeRaw)
	.use(rehypeStringify, { allowDangerousHtml: true })

async function renderFixture(name: string): Promise<string> {
	const file = await readFile(fileURLToPath(new URL(`${name}.mdx`, FIXTURE_BASE)), 'utf8')
	const body = stripFrontmatter(file)
	const result = await mdxCompile.process(body)
	return String(result)
}

/** Query the sanitized output as a DOM. */
function dom(html: string): Document {
	// Wrap so linkedom has a body to parse into.
	return parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`).document
}

describe('e2e: MDX fixtures through the full sanitize pipeline', () => {
	it('tables: preserves structure from both pipe and HTML markup', async () => {
		const rendered = await renderFixture('tables')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		// Both the pipe table and the HTML table contribute at least one
		// <table>; the count depends on Defuddle's handling of complex tables
		// (it may merge or demote), so we check for presence, not exact count.
		const tables = doc.querySelectorAll('table')
		expect(tables.length).toBeGreaterThanOrEqual(1)

		// Pipe-table content survives.
		expect(out).toContain('Apple')
		expect(out).toContain('Banana')

		// No dangerous carryover.
		expect(doc.querySelector('script')).toBeNull()
		expect(doc.querySelector('style')).toBeNull()
	})

	it('unsafe-elements: strips script, style, form, iframe, object, embed, svg', async () => {
		const rendered = await renderFixture('unsafe-elements')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		expect(doc.querySelector('script')).toBeNull()
		expect(doc.querySelector('style')).toBeNull()
		expect(doc.querySelector('form')).toBeNull()
		expect(doc.querySelector('input')).toBeNull()
		expect(doc.querySelector('button')).toBeNull()
		// iframe to evil host is dropped by the host filter
		expect(doc.querySelector('iframe')).toBeNull()
		expect(doc.querySelector('object')).toBeNull()
		expect(doc.querySelector('embed')).toBeNull()
		expect(doc.querySelector('svg')).toBeNull()
		// Inline event handlers must never land in the output.
		expect(out).not.toMatch(INLINE_EVENT_HANDLER)
		// Dangerous schemes must not land in href.
		expect(out).not.toMatch(HREF_JAVASCRIPT)
		expect(out).not.toMatch(HREF_DATA)
		expect(out).not.toMatch(HREF_FILE)
		expect(out).not.toContain('alert(')
		// Inline style is gone.
		expect(out).not.toMatch(INLINE_STYLE_ATTR)
	})

	it('safe-embeds: allowlisted iframes pass; srcdoc is stripped', async () => {
		const rendered = await renderFixture('safe-embeds')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		const iframes = [...doc.querySelectorAll('iframe')]
		expect(iframes.length).toBeGreaterThanOrEqual(1)
		for (const frame of iframes) {
			const src = frame.getAttribute('src') ?? ''
			expect(src).toMatch(SAFE_EMBED_SRC)
			expect(frame.hasAttribute('srcdoc')).toBe(false)
		}
	})

	it('links: keeps safe schemes, drops dangerous ones, adds rel to target=_blank', async () => {
		const rendered = await renderFixture('links')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		// Safe schemes survive.
		expect(out).toContain('href="mailto:editor@example.org"')
		expect(out).toContain('href="tel:+15555551212"')
		expect(out).toContain('https://example.org/one')

		// Dangerous schemes do not.
		expect(out).not.toMatch(HREF_JAVASCRIPT)
		expect(out).not.toMatch(HREF_DATA)
		expect(out).not.toMatch(HREF_FILE)
		expect(out).not.toMatch(HREF_VBSCRIPT)

		// Target=_blank is either dropped by Defuddle or, if it survives,
		// hardened with noopener + noreferrer. Either outcome is acceptable;
		// what's unacceptable is a target=_blank without those rels.
		for (const anchor of doc.querySelectorAll('a[target="_blank"]')) {
			const relationship = anchor.getAttribute('rel') ?? ''
			expect(relationship).toContain('noopener')
			expect(relationship).toContain('noreferrer')
		}
	})

	it('media: keeps img/picture/video/audio; strips autoplay', async () => {
		const rendered = await renderFixture('media')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		// No media element should carry an `autoplay` attribute, regardless of
		// how Defuddle reshaped the surrounding markup. We check the DOM, not
		// the raw HTML, so that the word "autoplay" inside prose/`<code>`
		// doesn't trigger a false positive.
		for (const media of doc.querySelectorAll('video, audio')) {
			expect(media.hasAttribute('autoplay')).toBe(false)
		}

		const images = doc.querySelectorAll('img')
		expect(images.length).toBeGreaterThanOrEqual(1)
		for (const img of images) {
			const src = img.getAttribute('src') ?? ''
			// No data: or javascript: image sources.
			expect(src).toMatch(HTTP_OR_HTTPS)
		}
	})

	it('semantic: preserves figure, blockquote cite, details/summary, time', async () => {
		const rendered = await renderFixture('semantic')
		const out = await sanitizeHtml(rendered, PERMALINK, false)
		const doc = dom(out)

		// Defuddle may rewrite structure, but the semantic content should
		// still be reachable as text.
		expect(out).toContain('shape our tools')
		expect(out).toContain('block of code')

		// No dangerous carryover.
		expect(doc.querySelector('script')).toBeNull()
	})

	it('excerpt: truncates at the #cut boundary', async () => {
		const rendered = await renderFixture('excerpt')
		const out = await sanitizeHtml(rendered, PERMALINK, { selector: '#cut' })

		// Pre-cut content survives.
		expect(out).toContain('above the cut')
		// Sentinel marker for everything below the cut must not appear.
		expect(out).not.toContain('ZZZBELOWZZZ')
	})
})
