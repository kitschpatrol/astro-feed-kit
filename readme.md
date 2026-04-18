<!-- title -->

# astro-feed-kit

<!-- /title -->

<!-- badges -->

[![NPM Package astro-feed-kit](https://img.shields.io/npm/v/astro-feed-kit.svg)](https://npmjs.com/package/astro-feed-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kitschpatrol/astro-feed-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/astro-feed-kit/actions/workflows/ci.yml)

<!-- /badges -->

<!-- short-description -->

**Astro integration for full-content feeds.**

<!-- /short-description -->

## Overview

`astro-feed-kit` generates RSS 2.0, Atom 1.0, and JSON Feed 1.0 endpoints from one or more Astro content collections. A single integration call emits all three formats from the same underlying data, so your feed readers can pick whichever they prefer without you maintaining three separate renderers.

The major twist vs. the usually-fine [`@astrojs/rss`](https://docs.astro.build/en/recipes/rss/) integration is that `@astrojs/rss` leaves content rendering to the user — you hand it a string or skip it entirely. `astro-feed-kit` instead runs each entry through Astro's container API, sanitizes the output, and inlines it in `<content:encoded>` / `<content>` / `content_html` automatically. This keeps full posts readable inside feed clients without a round-trip to the site.

It covers:

- **Three formats from one config**\
  RSS 2.0, Atom 1.0, and JSON Feed 1.0 endpoints, auto-injected as prerendered routes.
- **Full-content rendering**\
  Each entry is rendered through `AstroContainer` (with your MDX / React / Svelte / Vue / etc. renderers), then cleaned up with [Defuddle](https://github.com/kepano/defuddle) and passed through [remark](https://remark.js.org) for stable, feed-reader-safe HTML.
- **Excerpt boundaries**\
  Cut posts off at an HTML comment (`<!-- excerpt -->`) or a CSS selector so teaser-style feeds work without duplicating content.
- **Frontmatter resolvers**\
  Customize feed `Item` output per source with a single `resolveItem({entry, siteUrl}): Partial<Item>` function. Fields you set override the built-in defaults; fields you omit fall through.
- **Works with Starlight**\
  Starlight sits on top of stock `astro:content`, so the `docs` collection can be fed just like any other collection — see [Starlight](#starlight) below.
- **Head component**\
  A small `<FeedKit />` Astro component emits the three `<link rel="alternate">` tags in your document `<head>`.

## Getting started

### Prerequisites

An [Astro](https://astro.build/) 6+ project with at least one [content collection](https://docs.astro.build/en/guides/content-collections/) whose entries carry a `title` and a `date`.

### Installation

```bash
pnpm add astro-feed-kit
```

### Integration setup

Add the integration to your Astro config and list the content collections that should feed items into the feed:

```ts
// In astro.config.ts
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    feedKit({
      feedOptions: {
        description: 'Latest posts from example.com',
        title: 'Example Blog',
      },
      sources: ['posts'],
    }),
  ],
  site: 'https://example.com',
})
```

A bare string in `sources` is shorthand for `{ collection: 'posts' }` with default behavior. Reach for the object form when you want to filter, sort, cap, re-link, or reshape that source's items.

The integration mounts three endpoints — served on request during `astro dev`, and prerendered at build time:

| Format        | Default path |
| ------------- | ------------ |
| RSS 2.0       | `/rss.xml`   |
| Atom 1.0      | `/atom.xml`  |
| JSON Feed 1.0 | `/feed.json` |

Filenames are configurable via the `formats` option.

The integration uses Astro's top-level `site` URL to build per-item permalinks and feed self-links, unless you set `feedOptions.link` explicitly.

### Head component

To advertise the feeds to browsers and feed readers, drop `<FeedKit />` into your site's `<head>`:

```astro
---
// src/layouts/Base.astro
import FeedKit from 'astro-feed-kit/components/FeedKit.astro'
---

<html>
  <head>
    <!-- ... -->
    <FeedKit />
  </head>
  <body>
    <slot />
  </body>
</html>
```

This emits three `<link rel="alternate">` tags pointing to the three feed endpoints. The link `title` attribute defaults to `feedOptions.title` and can be overridden per page via a `title` prop.

## Configuration

The integration accepts a single `FeedKitConfig` object.

| Option            | Type                                                            | Default                                                                                                                     | Description                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`         | `SourceInput[]`                                                 | —                                                                                                                           | Required. One entry per content collection you want in the feed. A bare string is shorthand for `{ collection: string }`; use the object form to customize that source (see [Sources](#sources) below).  |
| `feedOptions`     | `FeedOptions` (from `feed`)                                     | —                                                                                                                           | Required. Passed to the underlying [feed](https://github.com/jpmonette/feed) library. `title` is required; `link` defaults to Astro's `site`.                                                            |
| `sort`            | `(a: Item, b: Item) => number`                                  | newest `date` first                                                                                                         | Comparator over the merged item set (after resolvers run). Items share a uniform shape regardless of source, so fields like `date`, `category`, and `link` are safe to read here.                        |
| `limit`           | `number`                                                        | `25`                                                                                                                        | Maximum items in the merged feed, applied after `sort`. Pass `Infinity` to include every item. Individual sources can cap themselves separately via `Source.limit`.                                      |
| `includeContent`  | `boolean`                                                       | `true`                                                                                                                      | When `false`, skips the container render and sanitize pipeline entirely — produces metadata-only feeds.                                                                                                  |
| `excerptBoundary` | `{comment: string} \| {selector: string} \| false`              | `{comment: 'excerpt'}`                                                                                                      | Where to truncate the rendered HTML. `false` disables truncation.                                                                                                                                        |
| `formats`         | `Partial<Record<'atom' \| 'json' \| 'rss', boolean \| string>>` | `{ atom: 'atom.xml', json: 'feed.json', rss: 'rss.xml'}`                                                                    | Per-format filename overrides and enable/disable flags. Pass a string for a custom filename, `false` to disable that format entirely (no route, no `<link>`), or `true` / omit for the default filename. |
| `knownRenderers`  | `string[]`                                                      | `@astrojs/mdx`, `@astrojs/react`, `@astrojs/preact`, `@astrojs/svelte`, `@astrojs/vue`, `@astrojs/solid-js`, `@astrojs/lit` | Additional content renderers to probe when `renderers` is not supplied. Merged with a default list of known Astro renderers.                                                                             |
| `renderers`       | `AstroRenderer[]`                                               | `[]`                                                                                                                        | Explicit list of Astro renderers to load into the content container. Skips `knownRenderers` probing when non-empty. Recommended for standalone `generateFeed` callers and exotic install layouts.        |

### Sources

Each entry in `sources` is either a collection name string or a `Source` object:

```ts
type Source = {
  collection: string
  filter?: (entry) => boolean
  limit?: number
  resolveItem?: ({ entry, siteUrl }) => Partial<Item>
  sort?: (a, b) => number
}

type SourceInput = Source | string
```

`collection` is the collection name registered in `src/content.config.ts`. Everything else narrows behavior for that source alone:

- `filter` — composed with the built-in gate that drops `draft: true` entries. Use it to hide archived posts, drafts with non-standard flags, or entries missing frontmatter your feed needs.
- `sort` — orders this source's entries before the per-source `limit` runs.
- `limit` — caps this source before items are merged across sources.
- `resolveItem` — returns a `Partial<Item>` to override built-in item fields for this source, including the per-entry `link`. See [Resolvers](#resolvers) below.

Example — two sources, one with a flat-slug permalink and a per-source cap:

```ts
feedKit({
  feedOptions: { description: '…', title: 'Example' },
  sources: [
    {
      collection: 'posts',
      limit: 20,
      // Flat slugs: /my-post/ instead of /posts/my-post/
      resolveItem: ({ entry, siteUrl }) => ({
        link: new URL(`${entry.id}/`, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString(),
      }),
    },
    'notes',
  ],
})
```

### Resolvers

Each source's `resolveItem` is one function that returns a `Partial<Item>` describing the resulting feed item:

```ts
type ItemResolver = (args: {
  entry: CollectionEntry<CollectionKey>
  siteUrl: string
}) => Partial<Item>
```

Return only the fields you want to customize. Anything you omit (or return as `undefined`) falls through to the built-in defaults — it does **not** clobber them.

The built-in defaults cover the common Astro frontmatter conventions plus the per-entry link:

| Item field    | Default                                    |
| ------------- | ------------------------------------------ |
| `title`       | `entry.data.title`                         |
| `date`        | `entry.data.date`                          |
| `published`   | `entry.data.date`                          |
| `description` | `entry.data.description`                   |
| `category`    | `entry.data.tags` mapped to `{name, term}` |
| `link`        | `{siteUrl}/{entry.collection}/{entry.id}/` |

`content` is populated separately by the pipeline from the sanitized rendered HTML (or dropped entirely when `includeContent: false`). Return `content: 'your string'` from a resolver only when you want to override the automatic fill.

Example — a `notes` collection uses `categories` instead of `tags` and `summary` instead of `description`:

```ts
feedKit({
  feedOptions: { description: '…', title: 'Example' },
  sources: [
    'posts',
    {
      collection: 'notes',
      resolveItem({ entry }) {
        const { categories } = entry.data
        return {
          category: Array.isArray(categories)
            ? categories
                .filter((name): name is string => typeof name === 'string')
                .map((name) => ({ name, term: name.toLowerCase() }))
            : undefined,
          description: entry.data.summary,
        }
      },
    },
  ],
})
```

### Tag category resolver

`tagCategoryResolver` is a convenience builder for sites that route per-tag pages at a stable URL prefix. It produces a `{category}` partial with `{name, term, domain}` entries, ready to spread inside your `resolveItem`:

```ts
import feedKit, { tagCategoryResolver } from 'astro-feed-kit'

feedKit({
  feedOptions: { description: '…', title: 'Example' },
  sources: [
    {
      collection: 'posts',
      resolveItem: (args) => ({
        ...tagCategoryResolver({ basePath: '/tags/' })(args),
      }),
    },
  ],
})
```

With `site: 'https://example.com'`, a post tagged `"Astro"` produces `<category domain="https://example.com/tags/astro">Astro</category>`.

### Excerpt boundaries

By default, each entry's rendered HTML is truncated at an `<!-- excerpt -->` comment. Everything after the marker is dropped from the feed, which is handy for teaser-style feeds paired with a "read more" link at the article URL.

```mdx
---
title: Hello
date: 2026-04-10
---

This first paragraph appears in the feed.

{/* excerpt */}

The rest only appears on the site.
```

Configure the boundary via `excerptBoundary`:

```ts
// Match a custom comment
feedKit({ excerptBoundary: { comment: 'feed-cut' } /* … */ })

// Match a CSS selector on the rendered body
feedKit({ excerptBoundary: { selector: 'hr.fold' } /* … */ })

// Disable truncation — publish full content
feedKit({ excerptBoundary: false /* … */ })
```

The truncation runs on the raw DOM before [Defuddle](https://github.com/kepano/defuddle) sanitizes it, because Defuddle strips HTML comments during its markdown conversion.

### Metadata-only feeds

Set `includeContent: false` to skip the render and sanitize pipeline entirely. This matches `@astrojs/rss`'s default behavior and is the right choice if you'd rather drive traffic to the site than publish full posts:

```ts
feedKit({
  feedOptions: { description: '…', title: 'Example' },
  includeContent: false,
  sources: ['posts'],
})
```

Any `content` returned from a resolver is dropped in this mode.

## Starlight

Starlight is a thin layer over stock `astro:content` — it registers no collections of its own, leaving the user to wire `docsLoader()` and `docsSchema()` into their own `src/content.config.ts`. Because `getCollection('docs')` and `render(entry)` are the standard Astro APIs, `astro-feed-kit` reads Starlight docs unmodified.

Three things differ from a plain Astro setup:

1. **Starlight's `docsSchema` has no `date` field.** Extend it to add one — pages without a `date` can be skipped via `filter`.
2. **Starlight routes `docs/*` at the site root.** Override `link` to drop the `docs/` prefix that feed-kit uses by default.
3. **Starlight owns the `<head>`.** Use its [`components.Head` override slot](https://starlight.astro.build/guides/overriding-components/) to inject `<FeedKit />`.

```ts
// Src/content.config.ts
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        date: z.coerce.date().optional(),
      }),
    }),
  }),
}
```

```ts
// Astro.config.ts
import starlight from '@astrojs/starlight'
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    starlight({
      components: { Head: './src/components/Head.astro' },
      title: 'Example docs',
    }),
    feedKit({
      feedOptions: {
        description: 'Latest docs updates.',
        title: 'Example docs',
      },
      sources: [
        {
          collection: 'docs',
          filter: (entry) => 'date' in entry.data && entry.data.date !== undefined,
          resolveItem: ({ entry, siteUrl }) => ({
            link: new URL(
              `${entry.id}/`,
              siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
            ).toString(),
          }),
        },
      ],
    }),
  ],
  site: 'https://example.com',
})
```

```astro
---
// src/components/Head.astro
import Default from '@astrojs/starlight/components/Head.astro'
import FeedKit from 'astro-feed-kit/components/FeedKit.astro'
---

<Default><slot /></Default>
<FeedKit />
```

## How it works

The integration runs in two phases:

1. **At Astro startup (dev or build)** — the `astro:config:setup` hook resolves the user config, stashes it in a `globalThis` slot keyed by a per-instance UUID, registers a Vite plugin that exposes the slot as `virtual:astro-feed-kit/config`, and injects three routes pointing at the packaged endpoint entrypoints.
2. **When an endpoint is evaluated** — each endpoint imports the virtual module, calls `generateFeed(config)`, and serializes the result via `feed.rss2()` / `feed.atom1()` / `feed.json1()`. In dev this happens on request; in production the routes are prerendered at build time.

`generateFeed` loads and validates eligible entries (every entry must have `title` and `date`), spins up an `AstroContainer` with the configured renderers, renders each entry, sanitizes the output through Defuddle + remark, runs the resolver chain, and assembles `Item` objects. The `feedOptions.updated` timestamp defaults to the newest item date when not supplied.

Resolver closures and filter functions are passed by reference through the `globalThis` slot rather than serialized, so they can reference anything in your `astro.config.ts`'s scope.

## Exports

### `astro-feed-kit` integration and utilities

| Export                    | Kind     | Description                                                                                                                |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `default` (`feedKit`)     | function | The Astro integration factory.                                                                                             |
| `defineFeedKitConfig`     | function | Merge user input with defaults and produce a fully resolved `ResolvedFeedKitConfig`. Useful when hand-rolling endpoints.   |
| `generateFeed`            | function | Build a populated `Feed` instance from a `ResolvedFeedKitConfig`. Returns a `feed` library `Feed` ready for serialization. |
| `getFeedPath`             | function | Resolve the site-relative path for a feed format given a `ResolvedFeedKitConfig`.                                          |
| `tagCategoryResolver`     | function | Build a `category` resolver that emits `{name, term, domain}` with per-tag URLs.                                           |
| `ItemSchema`              | schema   | Zod schema for the feed `Item` shape.                                                                                      |
| `FeedEligibleEntrySchema` | schema   | Zod schema enforcing the minimum entry contract (`title`, `date`).                                                         |
| `AuthorSchema`            | schema   | Zod schema for `{name, email, link, avatar}`.                                                                              |
| `CategorySchema`          | schema   | Zod schema for `{name, term, domain, scheme}`.                                                                             |
| `EnclosureSchema`         | schema   | Zod schema for media enclosures.                                                                                           |
| `ExtensionSchema`         | schema   | Zod schema for feed extensions.                                                                                            |

Types:

`ExcerptBoundary`, `FeedEligibleEntry`, `FeedKitConfig`, `FormatFilenames`, `FormatsInput`, `Item`, `ItemResolver`, `ItemResolverArgs`, `ResolvedFeedKitConfig`, `Source`, `SourceInput`.

### `astro-feed-kit/components/FeedKit.astro` component

Astro component that emits `<link rel="alternate">` tags for the RSS, Atom, and JSON Feed endpoints. Accepts an optional `title` prop to override the link title (defaults to `feedOptions.title`).

## Maintainers

[@kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

[Jean-Philippe Monette](https://blogue.jpmonette.net/)'s [feed](https://github.com/jpmonette/feed) library made quick work of actually generating correct feeds from a common data model.

[Christian Praß](https://prass.tech/)'s blog post "[Astro RSS Feeds with Full MDX Content](https://prass.tech/blog/rss-full-content-rendering/)" was also helpful.

Gratitude is always due to the [unified](https://unifiedjs.com) [team](https://github.com/unifiedjs/collective/?tab=readme-ov-file#unified-team) for [remark](https://remark.js.org) and their entire ecosystem of AST-wrangling libraries and tools.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/astro-feed-kit/issues) and pull requests are welcome.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © Eric Mika

<!-- /license -->
