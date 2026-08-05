import { describe, expect, it } from 'vitest'
import { markdownToHtml, sanitizeHtml } from '../src/integration/sanitize'

const PERMALINK = 'https://example.com/post'

// Static regexes hoisted to module scope (lint: prefer-static-regex).
const COLSPAN_2 = /colspan="?2"?/v
const ROWSPAN_2 = /rowspan="?2"?/v
const INPUT_DISABLED_CHECKBOX = /<input disabled type="checkbox">/v
const TYPE_TEXT = /type="text"/v
const CHECKBOX_INPUT = /<input[^>]*type="checkbox"[^>]*>/v
const DISABLED_INPUT = /<input[^>]*disabled[^>]*>/v
const TARGET_BLANK = /target="_blank"/v
const REL_HAS_NOOPENER = /rel="[^"]*noopener[^"]*"/v
const REL_HAS_NOREFERRER = /rel="[^"]*noreferrer[^"]*"/v
const HREF_DATA_SCHEME = /href="data:/v
// Built from parts so `no-script-url` doesn't flag the literal string.
const JAVASCRIPT_SCHEME = ['java', 'script:'].join('')

describe('sanitizeHtml', () => {
	it('returns sanitized HTML when no boundary is configured (false)', async () => {
		const html = `<p>before</p><h2>after</h2><p>more</p>`
		const out = await sanitizeHtml(html, PERMALINK, false)
		expect(out).toContain('before')
		expect(out).toContain('after')
		expect(out).toContain('more')
	})

	it('truncates at a top-level comment boundary', async () => {
		const html = `<p>before</p><!-- excerpt --><h2>after</h2><p>more</p>`
		const out = await sanitizeHtml(html, PERMALINK, { comment: 'excerpt' })
		expect(out).toContain('before')
		expect(out).not.toContain('after')
		expect(out).not.toContain('more')
	})

	it('matches the comment by trimmed text', async () => {
		const html = `<p>before</p><!--   excerpt   --><p>after</p>`
		const out = await sanitizeHtml(html, PERMALINK, { comment: 'excerpt' })
		expect(out).toContain('before')
		expect(out).not.toContain('after')
	})

	it('truncates when the marker is nested inside an element', async () => {
		// Marker inside <p>: keep "before", drop "after" and everything after the
		// containing paragraph.
		const html = `<p>before<!-- excerpt -->after</p><h2>more</h2>`
		const out = await sanitizeHtml(html, PERMALINK, { comment: 'excerpt' })
		expect(out).toContain('before')
		expect(out).not.toContain('after')
		expect(out).not.toContain('more')
	})

	it('is a no-op when the marker is not found (full body survives)', async () => {
		// Use long-enough paragraphs so Defuddle's content extractor keeps both.
		const before = `<p>${'before content '.repeat(20)}</p>`
		const after = `<p>${'after content '.repeat(20)}</p>`
		const out = await sanitizeHtml(`${before}${after}`, PERMALINK, { comment: 'missing-marker' })
		expect(out).toContain('before content')
		expect(out).toContain('after content')
	})

	it('truncates at a CSS selector boundary', async () => {
		const html = `<p>before</p><h2 id="cut">cut</h2><p>after</p>`
		const out = await sanitizeHtml(html, PERMALINK, { selector: '#cut' })
		expect(out).toContain('before')
		expect(out).not.toContain('after')
	})

	it('appends a default read-more link when readMore is true', async () => {
		const html = `<p>before</p><!-- excerpt --><p>after</p>`
		const out = await sanitizeHtml(html, PERMALINK, { comment: 'excerpt', readMore: true })
		expect(out).toContain('before')
		expect(out).not.toContain('after')
		expect(out).toContain('Continue reading →')
		expect(out).toContain(`href="${PERMALINK}"`)
	})

	it('appends a custom read-more link when readMore is a string', async () => {
		const html = `<p>before</p><!-- excerpt --><p>after</p>`
		const out = await sanitizeHtml(html, PERMALINK, {
			comment: 'excerpt',
			readMore: 'Read the full post',
		})
		expect(out).toContain('Read the full post')
		expect(out).toContain(`href="${PERMALINK}"`)
	})

	it('does not append a read-more link when readMore is omitted', async () => {
		const html = `<p>before</p><!-- excerpt --><p>after</p>`
		const out = await sanitizeHtml(html, PERMALINK, { comment: 'excerpt' })
		expect(out).not.toContain('Continue reading')
	})

	it('does not append a read-more link when the marker is not found', async () => {
		const before = `<p>${'before content '.repeat(20)}</p>`
		const after = `<p>${'after content '.repeat(20)}</p>`
		const out = await sanitizeHtml(`${before}${after}`, PERMALINK, {
			comment: 'missing',
			readMore: true,
		})
		expect(out).not.toContain('Continue reading')
	})
})

// The `sanitizeHtml` tests below cover the full integration path: HTML input
// → linkedom truncation → Defuddle (HTML → markdown) → unified pipeline →
// HTML output. Defuddle aggressively normalizes its output — it strips most
// element attributes (target, colspan, rowspan, style, etc.) when serializing
// to markdown, so the integration tests here only assert coarse survival of
// structural elements.
//
// The finer-grained allowlist tests live in the `markdownToHtml: allowlist`
// suite below, which exercises the unified pipeline directly with markdown +
// raw HTML — the layer where `rehypeFeedTransform` and `rehypeSanitize`
// actually run.
describe('sanitizeHtml: integration', () => {
	const padding = 'body content '.repeat(20)

	it('preserves HTML tables through the Defuddle roundtrip', async () => {
		const html = `<p>${padding}</p>
<table>
  <thead><tr><th>h1</th><th>h2</th></tr></thead>
  <tbody><tr><td>a</td><td>b</td></tr></tbody>
</table>`
		const out = await sanitizeHtml(html, PERMALINK, false)
		expect(out).toContain('<table>')
		expect(out).toContain('<th>h1</th>')
		expect(out).toContain('<td>a</td>')
	})

	it('strips <script>, <style>, <form>, <iframe> end-to-end', async () => {
		const html = `<p>${padding}</p>
<script>alert(1)</script>
<style>.x{color:red}</style>
<form><input type="text" name="x"></form>
<iframe src="https://evil.example/embed"></iframe>`
		const out = await sanitizeHtml(html, PERMALINK, false)
		expect(out).not.toContain('<script')
		expect(out).not.toContain('alert(1)')
		expect(out).not.toContain('<style')
		expect(out).not.toContain('<form')
		expect(out).not.toContain('<input')
		expect(out).not.toContain('<iframe')
		expect(out).not.toContain('evil.example')
	})
})

// `markdownToHtml` is the post-Defuddle layer: remarkParse → remarkGfm →
// remarkRehype(allowDangerousHtml) → rehypeRaw → rehypeFeedTransform →
// rehypeSanitize → rehypeStringify. Testing it directly lets us probe behavior
// that Defuddle would otherwise obscure — attribute preservation, iframe host
// filtering, link rel hardening, GFM table parsing.
describe('markdownToHtml: allowlist', () => {
	it('parses GFM pipe tables', async () => {
		const md = `| h1 | h2 |
| --- | --- |
| a | b |
`
		const out = await markdownToHtml(md)
		expect(out).toContain('<table>')
		expect(out).toContain('<th>h1</th>')
		expect(out).toContain('<td>a</td>')
	})

	it('preserves raw HTML tables with colspan/rowspan', async () => {
		const md = `
<table>
  <thead><tr><th colspan="2">header</th></tr></thead>
  <tbody><tr><td rowspan="2">x</td><td>y</td></tr></tbody>
</table>
`
		const out = await markdownToHtml(md)
		expect(out).toContain('<table>')
		expect(out).toMatch(COLSPAN_2)
		expect(out).toMatch(ROWSPAN_2)
	})

	it('strips <script>, <style>, and <form>; coerces <input> to disabled checkbox', async () => {
		const md = `Body.

<script>alert(1)</script>
<style>.x{color:red}</style>
<form><input type="text" name="x"></form>
`
		const out = await markdownToHtml(md)
		expect(out).not.toContain('<script')
		expect(out).not.toContain('alert(1)')
		expect(out).not.toContain('<style')
		expect(out).not.toContain('<form')
		// The upstream GitHub schema preserves <input> but forces it to a
		// disabled checkbox (for GFM task-list rendering). The `name` and any
		// other text-input attrs are stripped, so the survivor is inert.
		expect(out).not.toContain('name="x"')
		expect(out).not.toMatch(TYPE_TEXT)
		expect(out).toMatch(INPUT_DISABLED_CHECKBOX)
	})

	it('renders GFM task list items as disabled checkboxes', async () => {
		const md = `- [x] done
- [ ] todo
`
		const out = await markdownToHtml(md)
		expect(out).toMatch(CHECKBOX_INPUT)
		expect(out).toMatch(DISABLED_INPUT)
	})

	it('strips inline style attributes', async () => {
		const md = `Body.

<p style="color:red">styled</p>
`
		const out = await markdownToHtml(md)
		expect(out).toContain('styled')
		expect(out).not.toContain('style=')
	})

	it('adds noopener and noreferrer to target="_blank" links', async () => {
		const md = `See <a href="https://example.org" target="_blank">site</a>.
`
		const out = await markdownToHtml(md)
		expect(out).toMatch(TARGET_BLANK)
		expect(out).toMatch(REL_HAS_NOOPENER)
		expect(out).toMatch(REL_HAS_NOREFERRER)
	})

	it('leaves rel untouched when target is not _blank', async () => {
		const md = `<a href="https://example.org">plain</a>
`
		const out = await markdownToHtml(md)
		expect(out).not.toContain('rel=')
	})

	it('preserves iframes from allowlisted hosts', async () => {
		const md = `<iframe src="https://www.youtube.com/embed/abc" title="demo"></iframe>
`
		const out = await markdownToHtml(md)
		expect(out).toContain('<iframe')
		expect(out).toContain('src="https://www.youtube.com/embed/abc"')
	})

	it('drops iframes from non-allowlisted hosts', async () => {
		const md = `<iframe src="https://evil.example/embed"></iframe>
`
		const out = await markdownToHtml(md)
		expect(out).not.toContain('<iframe')
		expect(out).not.toContain('evil.example')
	})

	it('drops iframes with non-https schemes even on allowlisted hosts', async () => {
		// The insecure scheme is the subject under test.
		// eslint-disable-next-line unicorn/prefer-https
		const md = `<iframe src="http://www.youtube.com/embed/abc"></iframe>
`
		const out = await markdownToHtml(md)
		expect(out).not.toContain('<iframe')
	})

	it('strips srcdoc from allowlisted iframes', async () => {
		const md = `<iframe src="https://www.youtube.com/embed/abc" srcdoc="<script>alert(1)</script>"></iframe>
`
		const out = await markdownToHtml(md)
		expect(out).toContain('<iframe')
		expect(out).not.toContain('srcdoc')
		expect(out).not.toContain('alert(1)')
	})

	it('drops href values with javascript: or data:text/html schemes', async () => {
		// Literal `javascript:` href is assembled dynamically so the lint rule
		// `no-script-url` (which flags `"javascript:..."` string literals) does
		// not trip on the deliberately-bad fixture.
		const md = `<a href="${JAVASCRIPT_SCHEME}alert(1)">js</a>\n\n<a href="data:text/html,abc">data</a>\n`
		const out = await markdownToHtml(md)
		expect(out).not.toContain(JAVASCRIPT_SCHEME)
		expect(out).not.toMatch(HREF_DATA_SCHEME)
	})

	it('keeps mailto: and tel: href schemes', async () => {
		const md = `<a href="mailto:x@example.com">email</a> <a href="tel:+15555551212">phone</a>
`
		const out = await markdownToHtml(md)
		expect(out).toContain('href="mailto:x@example.com"')
		expect(out).toContain('href="tel:+15555551212"')
	})
})
