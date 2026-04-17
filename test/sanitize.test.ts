import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../src/integration/sanitize'

const PERMALINK = 'https://example.com/post'

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
})
