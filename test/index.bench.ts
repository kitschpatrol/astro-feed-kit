/* eslint-disable ts/no-unsafe-type-assertion */

// Performance benchmarks for the feed-generation hot paths.
//
// Scope:
//   1. `sanitizeHtml`       — full per-item pipeline (linkedom → Defuddle → unified).
//                             This is the dominant cost per entry when
//                             `includeContent: true`.
//   2. `markdownToHtml`     — the post-Defuddle unified layer in isolation.
//   3. `resolveItemFields`  — per-entry resolver + default item shape construction.
//   4. `generateFeed`       — end-to-end with `includeContent: false`, so the
//                             AstroContainer and Vite/astro:content content paths
//                             are skipped. Measures filter/sort/limit/validate/
//                             resolve/merge overhead across many entries.
//   5. `generateFeed`       — end-to-end with `includeContent: true`. The Astro
//                             render + container layers are stubbed (no real
//                             Astro renderer is available in vitest), so each
//                             entry's rendered body is a fixed HTML fixture.
//                             The real `sanitizeHtml` runs per entry, which is
//                             the dominant cost in this mode.
//
// `astro:content` is mocked so the feed pipeline can run in vitest without Astro.

import type { CollectionEntry, CollectionKey } from 'astro:content'
import { bench, describe, vi } from 'vitest'
import type { ItemResolverArgs, SourceInput } from '../src/integration/config'
import type { Item } from '../src/integration/schemas'
import { defineFeedKitConfig } from '../src/integration/config'
import { generateFeed } from '../src/integration/feed'
import {
	defaultItemResolver,
	resolveItemFields,
	tagCategoryResolver,
} from '../src/integration/item-map'
import { markdownToHtml, sanitizeHtml } from '../src/integration/sanitize'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PERMALINK = 'https://example.com/posts/sample/'
const SITE_URL = 'https://example.com/'

const SMALL_HTML = `
<p>A short paragraph with a <a href="https://example.org">link</a> and some <em>emphasis</em>.</p>
`.trim()

const MEDIUM_HTML = buildArticleHtml(10)
const LARGE_HTML = buildArticleHtml(80)

const MEDIUM_HTML_WITH_EXCERPT = MEDIUM_HTML.replace(
	'</p>',
	'</p><!-- excerpt -->',
	// Replace only the first occurrence (default behavior of String.replace)
)

const SMALL_MARKDOWN = `
# Heading

A short paragraph with a [link](https://example.org) and **bold** text.
`.trim()

const MEDIUM_MARKDOWN = buildArticleMarkdown(10)

// Build a blog-post-shaped HTML body with \`paragraphs\` paragraphs interspersed
// with headings, a list, a table, a code block, and a couple of links / images.
function buildArticleHtml(paragraphs: number): string {
	const lorem =
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod ' +
		'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
		'quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'

	const parts: string[] = ['<h1>Sample article</h1>']
	for (let index = 0; index < paragraphs; index += 1) {
		parts.push(`<p>${lorem} <a href="/relative/${index}">link ${index}</a>.</p>`)
		if (index % 3 === 0) {
			parts.push(`<h2 id="section-${index}">Section ${index}</h2>`)
		}
	}

	parts.push(
		'<ul><li>one</li><li>two</li><li>three <a href="https://example.org" target="_blank">outbound</a></li></ul>',
		'<table><thead><tr><th>a</th><th>b</th></tr></thead>' +
			'<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>',
		'<pre><code>const x = 42\nconsole.log(x)</code></pre>',
		'<p><img src="/images/figure.png" alt="a figure" width="640" height="360"></p>',

		'<p><iframe src="https://www.youtube.com/embed/abc" title="video"></iframe></p>',
	)
	return parts.join('\n')
}

function buildArticleMarkdown(paragraphs: number): string {
	const lorem =
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod ' +
		'tempor incididunt ut labore et dolore magna aliqua.'
	const parts: string[] = ['# Sample article\n']
	for (let index = 0; index < paragraphs; index += 1) {
		parts.push(`${lorem} [link ${index}](https://example.org/${index}).\n`)
		if (index % 3 === 0) {
			parts.push(`## Section ${index}\n`)
		}
	}

	parts.push(
		'- one\n- two\n- three\n',
		'| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n',
		'```\nconst x = 42\nconsole.log(x)\n```\n',
	)
	return parts.join('\n')
}

// ---------------------------------------------------------------------------
// sanitizeHtml — full per-item pipeline
// ---------------------------------------------------------------------------

describe('sanitizeHtml', () => {
	bench('small body, no excerpt boundary', async () => {
		await sanitizeHtml(SMALL_HTML, PERMALINK, false)
	})

	bench('medium body, no excerpt boundary', async () => {
		await sanitizeHtml(MEDIUM_HTML, PERMALINK, false)
	})

	bench('large body, no excerpt boundary', async () => {
		await sanitizeHtml(LARGE_HTML, PERMALINK, false)
	})

	bench('medium body, comment excerpt boundary', async () => {
		await sanitizeHtml(MEDIUM_HTML_WITH_EXCERPT, PERMALINK, { comment: 'excerpt' })
	})

	bench('medium body, selector excerpt boundary', async () => {
		await sanitizeHtml(MEDIUM_HTML, PERMALINK, { selector: '#section-0' })
	})
})

// ---------------------------------------------------------------------------
// markdownToHtml — unified-only layer (post-Defuddle)
// ---------------------------------------------------------------------------

describe('markdownToHtml', () => {
	bench('small markdown', async () => {
		await markdownToHtml(SMALL_MARKDOWN)
	})

	bench('medium markdown with GFM table + code', async () => {
		await markdownToHtml(MEDIUM_MARKDOWN)
	})
})

// ---------------------------------------------------------------------------
// item-map — per-entry resolver overhead
// ---------------------------------------------------------------------------

// Mirrors the helper pattern in `test/item-map.test.ts`: fabricate a
// `CollectionEntry` shape without the project's `CollectionKey` narrowing the
// collection name, since these benchmarks operate on synthetic data rather
// than a real Astro content collection.
function makeEntry(data: Record<string, unknown>): CollectionEntry<CollectionKey> {
	return {
		body: '',
		collection: 'posts',
		data,
		id: 'sample',
	} as unknown as CollectionEntry<CollectionKey>
}

function makeArgs(data: Record<string, unknown>): ItemResolverArgs {
	return { entry: makeEntry(data), siteUrl: SITE_URL }
}

const resolverArgsPlain = makeArgs({
	date: new Date('2026-01-01T00:00:00Z'),
	description: 'Lead-in text.',
	title: 'Sample',
})

const resolverArgsWithTags = makeArgs({
	date: new Date('2026-01-01T00:00:00Z'),
	description: 'Lead-in text.',
	tags: ['Hello World', 'foo bar', 'typescript', 'astro', 'feed-kit', 'performance', 'rss'],
	title: 'Sample',
})

const tagOverlay = tagCategoryResolver({ basePath: '/tags/' })

describe('resolveItemFields', () => {
	bench('defaults only, no tags', () => {
		defaultItemResolver(resolverArgsPlain)
	})

	bench('defaults only, with 7 tags (slugify path)', () => {
		defaultItemResolver(resolverArgsWithTags)
	})

	bench('with user resolver overlay (no-op override)', () => {
		resolveItemFields(resolverArgsWithTags, ({ entry }) => ({
			description: (entry.data as { description?: string }).description,
		}))
	})

	bench('with tagCategoryResolver overlay (URL per tag)', () => {
		resolveItemFields(resolverArgsWithTags, (args) => ({ ...tagOverlay(args) }))
	})
})

// ---------------------------------------------------------------------------
// generateFeed — end-to-end without content rendering
// ---------------------------------------------------------------------------
//
// Mocks `astro:content` the same way `test/pipeline.test.ts` does so the
// pipeline can run outside Astro. `includeContent: false` skips the
// AstroContainer and the dynamic `astro:content` render import, which means
// this bench measures the non-content path: filter → schema validation →
// per-source sort/limit → resolver → merge → top-level sort/limit.

type FakeEntry = {
	collection: string
	data: Record<string, unknown>
	id: string
}

const entryStore = new Map<string, FakeEntry[]>()

vi.mock('astro:content', () => ({
	async getCollection(name: string, filter?: (entry: FakeEntry) => boolean): Promise<FakeEntry[]> {
		const entries = await Promise.resolve(entryStore.get(name) ?? [])
		return filter === undefined ? entries : entries.filter((entry) => filter(entry))
	},
	// Used by `includeContent: true`. The returned `Content` is opaque — the
	// stubbed container below ignores it and returns a fixed HTML body.
	// `Content` is PascalCase because it mirrors Astro's public render() shape.
	/* eslint-disable ts/naming-convention, ts/require-await */
	async render(): Promise<{ Content: string }> {
		return { Content: 'stub' }
	},
	/* eslint-enable ts/naming-convention, ts/require-await */
}))

// Stub the container module so `includeContent: true` benches don't need a
// real Astro renderer. `createContainer` returns an object with a
// `renderToString` that yields `RENDERED_ENTRY_HTML`, which is then handed
// to the real `sanitizeHtml` pipeline — the part we actually want to measure.
vi.mock('../src/integration/container', () => ({
	/* eslint-disable-next-line ts/require-await */
	async createContainer() {
		return {
			/* eslint-disable-next-line ts/require-await */
			async renderToString() {
				return RENDERED_ENTRY_HTML
			},
		}
	},
	/* eslint-disable-next-line ts/require-await */
	async resolveContainerRenderers() {
		return []
	},
}))

// Representative blog-post body that each stubbed entry "renders" to. Kept
// at the medium size so the sanitize cost per entry is realistic but the
// bench finishes in reasonable time at higher entry counts.
const RENDERED_ENTRY_HTML = MEDIUM_HTML

function makeEntries(collection: string, count: number): FakeEntry[] {
	const result: FakeEntry[] = []
	for (let index = 0; index < count; index += 1) {
		result.push({
			collection,
			data: {
				date: new Date(Date.UTC(2026, 0, 1 + (index % 365))),
				description: `Description ${index} for ${collection}.`,
				tags: ['alpha', 'beta', `topic-${index % 10}`],
				title: `${collection} entry ${index}`,
			},
			id: `${collection}-${index}`,
		})
	}

	return result
}

// Populate the mock store once. `vi.mock` hoists above imports, so the mock
// itself is live by the time these assignments run.
entryStore.set('posts-small', makeEntries('posts-small', 10))
entryStore.set('posts-medium', makeEntries('posts-medium', 100))
entryStore.set('notes-medium', makeEntries('notes-medium', 100))
entryStore.set('posts-large', makeEntries('posts-large', 500))
entryStore.set('notes-large', makeEntries('notes-large', 500))
entryStore.set('links-large', makeEntries('links-large', 500))

const baseFeedOptions = {
	description: 'd',
	link: 'https://example.com',
	title: 't',
}

function source(spec: { collection: string }): SourceInput {
	return spec as unknown as SourceInput
}

const smallConfig = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: false,
	limit: 25,
	sources: [source({ collection: 'posts-small' })],
})

const mediumConfig = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: false,
	limit: 50,
	sources: [source({ collection: 'posts-medium' }), source({ collection: 'notes-medium' })],
})

const largeConfig = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: false,
	limit: 100,
	sources: [
		source({ collection: 'posts-large' }),
		source({ collection: 'notes-large' }),
		source({ collection: 'links-large' }),
	],
})

const largeConfigWithResolver = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: false,
	limit: 100,
	sort: (a: Item, b: Item) => b.date.getTime() - a.date.getTime(),
	sources: [
		{
			collection: 'posts-large' as never,
			resolveItem: (args: { entry: { data: Record<string, unknown> }; siteUrl: string }) => ({
				...tagCategoryResolver({ basePath: '/tags/' })(
					args as unknown as Parameters<ReturnType<typeof tagCategoryResolver>>[0],
				),
				description: (args.entry.data as { description?: string }).description,
			}),
		},
		source({ collection: 'notes-large' }),
		source({ collection: 'links-large' }),
	],
})

describe('generateFeed (includeContent: false)', () => {
	bench('10 entries, 1 source', async () => {
		await generateFeed(smallConfig)
	})

	bench('200 entries, 2 sources', async () => {
		await generateFeed(mediumConfig)
	})

	bench('1500 entries, 3 sources', async () => {
		await generateFeed(largeConfig)
	})

	bench('1500 entries, 3 sources, with custom resolvers', async () => {
		await generateFeed(largeConfigWithResolver)
	})
})

// ---------------------------------------------------------------------------
// generateFeed — end-to-end with content rendering (stubbed renderer)
// ---------------------------------------------------------------------------
//
// The container and `astro:content.render` are stubbed above, so each entry's
// "rendered" body is `RENDERED_ENTRY_HTML`. Every other step of the pipeline
// is real, including `sanitizeHtml`, which dominates cost in this mode.

const smallContentConfig = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: true,
	limit: 25,
	sources: [source({ collection: 'posts-small' })],
})

const mediumContentConfig = defineFeedKitConfig({
	feedOptions: baseFeedOptions,
	includeContent: true,
	limit: 50,
	sources: [source({ collection: 'posts-medium' }), source({ collection: 'notes-medium' })],
})

describe('generateFeed (includeContent: true)', () => {
	bench('10 entries, 1 source', async () => {
		await generateFeed(smallContentConfig)
	})

	bench('200 entries, 2 sources', async () => {
		await generateFeed(mediumContentConfig)
	})
})
