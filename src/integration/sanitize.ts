/* eslint-disable new-cap */

import type { Element, Root } from 'hast'
import type { Schema } from 'hast-util-sanitize'
import { Defuddle } from 'defuddle/node'
import { parseHTML } from 'linkedom'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'
import type { ExcerptBoundary } from './config'

/**
 * Hosts whose iframes are preserved. Everything else is dropped. This is a
 * deliberate middle ground: the Atom spec (RFC 4287) calls iframes unsafe, but
 * real feed readers render them from well-known embed providers. Keeping the
 * list short and editing it in-tree is preferable to exposing user config —
 * the policy is a pragmatic tradeoff, not per-site configuration.
 */
const ALLOWED_IFRAME_HOSTS = new Set([
	'bandcamp.com',
	'codepen.io',
	'codesandbox.io',
	'gist.github.com',
	'open.spotify.com',
	'player.twitch.tv',
	'player.vimeo.com',
	'w.soundcloud.com',
	'www.youtube-nocookie.com',
	'www.youtube.com',
])

/**
 * Feed-tuned sanitizer schema. Extends hast-util-sanitize's GitHub-flavored
 * default with broader semantic element coverage (figures, media, semantic
 * sectioning, `<iframe>`) and stricter protocol/attribute policies suited to
 * feed content.
 *
 * Property names are hast camelCase (e.g. `className`, `colSpan`, `srcSet`,
 * `allowFullScreen`) — not DOM attribute names. See hast-util-sanitize docs.
 */
const feedSchema: Schema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		// Narrow the global attribute allowlist. Default includes form-era
		// attrs (action, method, readOnly, selected, etc.) that only matter on
		// elements we don't allow anyway, but we prefer an explicit, minimal
		// global surface.
		'*': [
			'className',
			'id',
			'lang',
			'dir',
			'title',
			'role',
			'ariaDescribedBy',
			'ariaLabel',
			'ariaLabelledBy',
			'itemScope',
			'itemType',
			'itemProp',
			'itemId',
			'itemRef',
		],
		a: [...(defaultSchema.attributes?.a ?? []), 'hrefLang', 'rel', 'target', 'download', 'type'],
		abbr: ['title'],
		audio: ['src', 'controls', 'preload', 'muted', 'loop'],
		blockquote: [...(defaultSchema.attributes?.blockquote ?? [])],
		col: ['span'],
		colgroup: ['span'],
		data: ['value'],
		del: [...(defaultSchema.attributes?.del ?? []), 'dateTime'],
		details: ['open'],
		dfn: ['title'],
		iframe: [
			'src',
			'width',
			'height',
			'title',
			'allow',
			'allowFullScreen',
			'loading',
			'referrerPolicy',
			'sandbox',
		],
		img: [
			...(defaultSchema.attributes?.img ?? []),
			'alt',
			'srcSet',
			'sizes',
			'width',
			'height',
			'loading',
			'decoding',
			'referrerPolicy',
			'title',
		],
		ins: [...(defaultSchema.attributes?.ins ?? []), 'dateTime'],
		li: [...(defaultSchema.attributes?.li ?? []), 'value'],
		ol: ['reversed', 'start', 'type'],
		source: [...(defaultSchema.attributes?.source ?? []), 'src', 'sizes', 'media', 'type'],
		// Table semantic attributes — not inherited via the narrowed `*` list
		// below (defaultSchema's `*` includes them but ours is narrower).
		table: [...(defaultSchema.attributes?.table ?? []), 'summary'],
		td: ['colSpan', 'rowSpan', 'headers', 'scope'],
		th: ['colSpan', 'rowSpan', 'headers', 'scope', 'abbr'],
		time: ['dateTime'],
		track: ['src', 'kind', 'srcLang', 'label', 'default'],
		video: [
			'src',
			'controls',
			'poster',
			'preload',
			'width',
			'height',
			'muted',
			'loop',
			'playsInline',
		],
	},
	protocols: {
		cite: ['http', 'https'],
		href: ['http', 'https', 'mailto', 'tel'],
		src: ['http', 'https'],
	},
	strip: ['script', 'style'],
	tagNames: [
		...(defaultSchema.tagNames ?? []),
		// Semantic sectioning
		'article',
		'section',
		'aside',
		'nav',
		'header',
		'footer',
		'main',
		'address',
		'hgroup',
		// Figures & captions
		'figure',
		'figcaption',
		// Tables — defaults already include table/thead/tbody/tfoot/tr/td/th
		'caption',
		'col',
		'colgroup',
		// Media
		'audio',
		'video',
		'track',
		// Inline text
		'mark',
		'abbr',
		'dfn',
		'time',
		'data',
		'cite',
		'small',
		'u',
		'rb',
		'rtc',
		'bdi',
		'bdo',
		'wbr',
		// Definition lists
		'dl',
		'dt',
		'dd',
		// Embedded content (host-filtered by `rehypeFeedTransform`)
		'iframe',
	],
}

/** Whitespace split pattern for existing `rel` string values. */
const REL_SPLIT = /\s+/

type VisitResult = [typeof SKIP, number] | undefined

/** Visit callback used by `rehypeFeedTransform` — hoisted to avoid a per-call closure. */
function visitFeedElement(
	node: Element,
	index: number | undefined,
	parent: Element | Root | undefined,
): VisitResult {
	if (node.tagName === 'a') {
		hardenAnchor(node)
		return undefined
	}
	if (node.tagName === 'iframe') {
		const keep = isAllowedIframe(node)
		if (!keep && parent !== undefined && typeof index === 'number') {
			parent.children.splice(index, 1)
			return [SKIP, index]
		}
		if (keep) {
			delete node.properties.srcDoc
		}
	}
	return undefined
}

/** Transformer for `rehypeFeedTransform`. Hoisted so the plugin factory has no closure. */
function feedTransform(tree: Root): void {
	visit(tree, 'element', visitFeedElement)
}

/**
 * Rehype plugin: link hardening + iframe host filtering.
 *
 * - `a[target="_blank"]` gets `rel="noopener noreferrer"` appended (idempotent).
 * - `<iframe>` is dropped unless its `src` parses to https on an allowlisted
 *   host. Any `srcDoc` is cleared defensively (also denied by the schema).
 *
 * Runs before `rehypeSanitize` so the sanitize pass is the final gate.
 */
function rehypeFeedTransform() {
	return feedTransform
}

/** Ensure `rel` contains `noopener` and `noreferrer` when the link opens in a new tab. */
function hardenAnchor(node: Element): void {
	if (node.properties.target !== '_blank') return
	const existing = node.properties.rel
	const rels = new Set<string>(
		Array.isArray(existing)
			? existing.map(String)
			: typeof existing === 'string'
				? existing.split(REL_SPLIT).filter(Boolean)
				: [],
	)
	rels.add('noopener')
	rels.add('noreferrer')
	node.properties.rel = [...rels]
}

/** True if the iframe's `src` is an https URL whose host is in the allowlist. */
function isAllowedIframe(node: Element): boolean {
	const { src } = node.properties
	if (typeof src !== 'string' || src.length === 0) return false
	let url: URL
	try {
		url = new URL(src)
	} catch {
		return false
	}
	if (url.protocol !== 'https:') return false
	return ALLOWED_IFRAME_HOSTS.has(url.hostname)
}

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeRaw)
	.use(rehypeFeedTransform)
	// Rehype-sanitize's typing is loose around the Schema generic; the imported
	// `Schema` type matches what the plugin accepts.

	.use(rehypeSanitize, feedSchema as Parameters<typeof rehypeSanitize>[0])
	.use(rehypeStringify)

/**
 * Runs the feed's unified pipeline over a markdown string: GFM parsing, raw
 * HTML preservation, link / iframe transforms, allowlist sanitization. This is
 * the layer that enforces the feed's HTML allowlist; `sanitizeHtml` is the
 * higher-level entry that first routes through Defuddle.
 *
 * Exported so tests can exercise the allowlist without Defuddle's upstream
 * attribute stripping obscuring what the sanitizer layer actually does.
 */
export const markdownToHtml = async (md: string): Promise<string> => {
	const file = await processor.process(md)
	return String(file)
}

function wrapInHtml(body: string): string {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body>${body}</body></html>`
}

// Types derived from parseHTML's return so we don't depend on linkedom
// re-exporting its DOM interfaces (which it doesn't stably across versions).
// `SanitizeNode` covers any ChildNode in the tree (Element, Text, Comment).
// `SanitizeAncestor` covers ancestors walked via `parentElement` — always
// an Element.
type SanitizeDocument = ReturnType<typeof parseHTML>['document']
type SanitizeNode = NonNullable<SanitizeDocument['firstChild']>
type SanitizeAncestor = NonNullable<SanitizeNode['parentElement']>

// Node.COMMENT_NODE. Inlined as a literal so we don't need a DOM lib
// reference in tsconfig.
const COMMENT_NODE = 8

/**
 * Depth-first search for the first HTML comment descendant of `root` whose
 * trimmed text equals `text`.
 */
function findCommentDescendant(
	root: SanitizeAncestor | SanitizeNode,
	text: string,
): SanitizeNode | undefined {
	for (let child = root.firstChild; child !== null; child = child.nextSibling) {
		if (child.nodeType === COMMENT_NODE && child.nodeValue?.trim() === text) {
			return child
		}
		const nested = findCommentDescendant(child, text)
		if (nested !== undefined) return nested
	}
	return undefined
}

function findBoundaryNode(
	document: SanitizeDocument,
	boundary: ExcerptBoundary,
): SanitizeNode | undefined {
	const { body } = document
	if ('comment' in boundary) {
		return findCommentDescendant(body, boundary.comment)
	}
	// Scoped to <body> so head elements never match.
	return body.querySelector(boundary.selector) ?? undefined
}

/** Remove every sibling that follows `node` from their shared parent. */
function removeFollowingSiblings(node: SanitizeAncestor | SanitizeNode): void {
	let sibling = node.nextSibling
	while (sibling !== null) {
		const next = sibling.nextSibling
		sibling.remove()
		sibling = next
	}
}

/**
 * Truncate `document` at `boundary`. Keeps all content before the marker in
 * document order; drops the marker itself and everything after. When the marker
 * is nested, walks up ancestor-by-ancestor trimming following siblings at each
 * level so no post-marker content survives.
 *
 * No-op when `boundary` is `false` or the marker is not found.
 */
function truncateAtBoundary(document: SanitizeDocument, boundary: ExcerptBoundary | false): void {
	if (boundary === false) return
	const marker = findBoundaryNode(document, boundary)
	if (marker === undefined) return
	const { body } = document

	// Phase A — at the marker's own level: drop everything after the marker,
	// then remove the marker itself. Capture the ancestor first because
	// `.remove()` detaches `parentElement`.
	removeFollowingSiblings(marker)
	const startAncestor = marker.parentElement
	marker.remove()

	// Phase B — walk up toward <body> via parentElement, trimming following
	// siblings at each level so nothing past the marker's position survives
	// in any ancestor.
	let node = startAncestor
	while (node !== null && node !== body) {
		removeFollowingSiblings(node)
		node = node.parentElement
	}
}

/**
 * Converts a given HTML string into a sanitized version suitable for RSS,
 * Atom, and JSON feeds.
 *
 * The pipeline is order-sensitive:
 *
 * 1. Excerpt truncation runs on the raw DOM before Defuddle, because Defuddle
 *    strips HTML comments during sanitization and then serializes to markdown
 *    — by the time it returns, the `<!-- excerpt -->` marker is gone.
 * 2. Defuddle extracts the main content and converts it to markdown (with
 *    GFM-compatible pipe tables for simple tables, raw HTML fallback for
 *    tables with colspan/rowspan).
 * 3. The unified processor re-parses that markdown with GFM support, converts
 *    to hast (preserving any raw HTML via `rehype-raw`), applies feed-specific
 *    transforms (link hardening, iframe host filtering), and finally enforces
 *    an allowlist schema before serializing back to HTML.
 *
 * @param html - The HTML string to sanitize. This can be the full content of a
 *   post, or just a snippet.
 * @param permalink - The permalink of the content being sanitized. This is used
 *   to resolve relative URLs within the content to absolute URLs.
 * @param excerptBoundary - Where to cut off the content. `false` disables
 *   truncation.
 *
 * @returns A sanitized HTML string that is safe to include in feed content.
 */
export async function sanitizeHtml(
	html: string,
	permalink: string,
	excerptBoundary: ExcerptBoundary | false,
): Promise<string> {
	const { document } = parseHTML(wrapInHtml(html))
	truncateAtBoundary(document, excerptBoundary)
	const { content } = await Defuddle(document, permalink, {
		markdown: true,
		// Defuddle's default removal passes target messy web pages — ads,
		// social buttons, hidden overlays, tracking pixels, small icons,
		// boilerplate "read time" markers. Astro-rendered content is a
		// clean fragment from a markdown/MDX source; none of those pass
		// over it will find anything to remove, but each one still walks
		// the DOM. The rehype-sanitize layer downstream is the security
		// gate (script/style/iframe policy, attribute allowlist), so
		// disabling these passes does not weaken what actually ships.
		removeContentPatterns: false,
		removeExactSelectors: false,
		removeHiddenElements: false,
		removePartialSelectors: false,
		removeSmallImages: false,
		standardize: true,
		// Never hit the network from inside feed generation. Defuddle's
		// async extractors are for browser-extension-style scraping of
		// third-party pages (YouTube transcripts, Reddit comments), not
		// for our own rendered entries.
		useAsync: false,
	})

	const cleanHtml = await markdownToHtml(content)
	return cleanHtml
}
