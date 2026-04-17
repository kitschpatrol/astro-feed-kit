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

TODO

## Getting started

### Prerequisites

An [Astro](https://astro.build/) 6+ project.

### Installation

```bash
pnpm add astro-feed-kit
```

### Integration setup

The simplest way to use `astro-feed-kit` is as an Astro integration:

```ts
// In astro.config.ts
import feedKit from 'astro-feed-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    feedKit({
      // TODO
    }),
  ],
  site: 'https://example.com',
})
```

### Head component

TODO adding feed links to `<head>` via `<FeedKit />` component.

## Configuration

TODO

## Exports

### `astro-feed-kit` (integration)

TODO

### `astro-feed-kit/components`

TODO

## Maintainers

[@kitschpatrol](https://github.com/kitschpatrol)

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/astro-feed-kit/issues) and pull requests are welcome.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © Eric Mika

<!-- /license -->
