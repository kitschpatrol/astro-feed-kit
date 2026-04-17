/* eslint-disable new-cap */

import { Defuddle } from 'defuddle/node'
import { parseHTML } from 'linkedom'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { ExcerptBoundary } from './config'

const markdownToHtml = async (md: string): Promise<string> => {
	const file = await processor.process(md)
	return String(file)
}

function wrapInHtml(body: string): string {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body>${body}</body></html>`
}

// Create the processor once (outside the function)
const processor = unified().use(remarkParse).use(remarkHtml) // ← this is the official shortcut (remark-rehype + rehype-stringify + sanitization)

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
 * Converts a given HTML string into a sanitized version suitable for RSS feeds.
 *
 * The pipeline is order-sensitive: excerpt truncation runs on the raw DOM
 * before Defuddle, because Defuddle strips HTML comments during sanitization
 * and then serializes to markdown — by the time it returns, the `<!-- excerpt
 * -->` marker is gone.
 *
 * @param html - The HTML string to sanitize. This can be the full content of a
 *   post, or just a snippet.
 * @param permalink - The permalink of the content being sanitized. This is used
 *   to resolve relative URLs within the content to absolute URLs.
 * @param excerptBoundary - Where to cut off the content. `false` disables
 *   truncation.
 *
 * @returns A sanitized HTML string that is safe to include in RSS feeds.
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
		standardize: true,
	})

	const cleanHtml = await markdownToHtml(content)
	return cleanHtml
}
