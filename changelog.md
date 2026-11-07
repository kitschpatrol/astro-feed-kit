# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-07

### Added

- Export `AstroSiteOptions` and accept it as an optional second argument to `defineFeedKitConfig` for standalone callers to supply Astro site and routing settings.

### Changed

- **Breaking:** Require Astro `^7.3.6`, raising the minimum supported version to include upstream fixes for Container API `Astro.site` values and injected routes under i18n.
- **Breaking:** Default `feedOptions.link` to Astro's `site` joined with `base` and normalize it to end with `/`, affecting feed self-links, the default feed ID, item links, and resolver `siteUrl`. Include `base` in `getFeedPath`, `<FeedKit />` links, startup logs, and tag category URLs.
- **Breaking:** Match Astro's `trailingSlash` and `build.format` rules for default item links, changing default item GUIDs when trailing slashes are removed.
- **Breaking:** Require `base` and `appendTrailingSlash` fields on `ResolvedFeedKitConfig`; `defineFeedKitConfig` populates both automatically.
- Share one feed-generation pass across RSS, Atom, and JSON endpoints during builds, rendering and sanitizing each entry once while retaining regeneration on every development request.

### Fixed

- Correct Atom's `rel="self"` link to point to the Atom feed instead of the RSS feed.
- Fix category slug generation to trim surrounding whitespace, preserve Unicode letters and digits, and collapse separators without leaving edge hyphens.
- Ignore renderer packages available only through `NODE_PATH`, preventing pnpm builds from failing with `ERR_MODULE_NOT_FOUND`; installations without `node_modules` must supply explicit `renderers`.

### Documentation

- Correct the documented `feedOptions` type and defaults, clarify enabled-format link output and disabled `getFeedPath` results, and update API guidance and resolver examples for Astro routing settings.
- Document HTML sanitization rules, relative URL resolution, allowed iframe hosts, and `srcset` limitations.
- Explain shared feed generation during builds and regeneration on every development request.
- Repair broken Datamation links in the HTML-in-feeds research notes.

### Maintenance

- Raise the bundled LinkeDOM requirement from `^0.18.14` to `^0.18.15`.
- Refresh development dependencies and GitHub Actions, upgrade pnpm to 12.18.0, and supply the missing `@emnapi/runtime` dependency for Astro's checking tools.
- Target Node.js 24 in builds to match the existing engine requirement, stop publishing source maps to reduce package size, and remove unused test configuration.
- Generate changelogs during releases with Chagent and upgrade the release-changelog action to v3.
- Add integration-hook and renderer-probing tests, plus end-to-end fixture builds covering generated feeds, head links, draft filtering, rendering, excerpts, and routing settings.
- Build the plain Astro and Starlight playgrounds in CI on Linux, macOS, and Windows.
- Exclude test fixture directories containing deliberately unresolved URLs from link checks.

## [0.5.1] - 2026-11-02

### Maintenance

- Update `unist-util-visit` from 5.1.0 to 5.2.0 and raise bundled dependency requirements to Defuddle `^0.19.6` and LinkeDOM `^0.18.14`.
- Refresh development dependencies, upgrade shared-config to 8.14 and pnpm to 12.16.1, simplify internal code, and clean up workspace dependency policies.
- Generate Astro types and build the package during repository preparation, and migrate contributor skill setup to pnpm’s native support.
- Switch automated dependency updates from weekly to monthly and refresh CI, release, and dependency-update actions.
- Exclude loopback URLs from link checks and allow checks with no matching links to succeed.

## [0.5.0] - 2026-10-07

### Changed

- **Breaking:** Restrict supported Node.js versions to `^24.16.0 || >=26.3.0`, dropping Node.js 25 and 26.0–26.2.

### Documentation

- Document the exact Node.js and Astro requirements in the installation prerequisites.

### Maintenance

- Raise the bundled Defuddle requirement to `^0.19.4`.
- Upgrade contributor tooling to pnpm 12, shared-config 8.12, Vitest 5, and tsdown 0.23, with stricter lint configuration, internal refactoring, and automatic repository skill synchronization.
- Migrate benchmarks to Vitest 5’s benchmark API with individual stored baselines and a baseline regeneration mode.
- Mark the published package as side-effect-free for bundlers.
- Add scheduled and manually triggered dependency-update automation.
- Pin release and metadata actions to full commit hashes, refresh CI setup, and correct link-check diagnostic capture.

## [0.4.2] - 2026-08-26

### Maintenance

- Raise the bundled Defuddle requirement to `^0.19.3`.
- Refresh development dependencies and workspace installation rules, and simplify sanitizer internals.
- Improve website link checks by discovering linked sitemaps, loading Lychee configuration, and pinning sitemap-discovery tooling.
- Update npm publishing to supply a one-time password from 1Password.

## [0.4.1] - 2026-08-05

### Changed

- **Breaking:** Raise the Node.js runtime minimum from 22.12.0 to 24.16.0.

### Documentation

- Correct the README prerequisites to require Astro 7 and refresh package and license links.

### Maintenance

- Raise bundled dependency requirements to Defuddle `^0.19.2` and LinkeDOM `^0.18.13`.
- Refresh development dependencies and editor tasks, adopt the shared Astro TypeScript configuration, simplify build/lint scripts, and tighten sanitizer assertions.
- Add automated repository and website link checks on pushes, pull requests, manual runs, and a weekly schedule.
- Refresh CI actions and validate release tags against the repository’s configured default branch before creating releases.

## [0.4.0] - 2026-07-07

### Changed

- **Breaking:** Require Astro 7 (`^7.0.0`), dropping Astro 6 support.
- Prefer renderer packages’ `/container-renderer` entrypoints for Astro 7 compatibility, retaining a package-root fallback.

### Documentation

- Update renderer API documentation and the MDX renderer example to use `/container-renderer` imports.

### Maintenance

- Upgrade the `feed` runtime requirement to `^6.0.0` and bundled Defuddle requirement to `^0.19.1`.
- Upgrade contributor tooling to TypeScript 6, Vite 8, shared-config 8, and pnpm 11.10, with lint-driven refactoring, updated development scripts, and a Node.js 24.16 development minimum.

## [0.3.1] - 2026-06-11

### Maintenance

- Exclude the Starlight playground’s Astro config from root type checking to avoid failures resolving its optional Markdown dependency.

## [0.3.0] - 2026-06-10

### Changed

- **Breaking:** Raise the Astro peer requirement from `^6.0.0` to `^6.4.0`.

### Maintenance

- Refresh development dependencies and upgrade the repository to pnpm 11.5.

## [0.2.4] - 2026-05-17

### Maintenance

- Roll back the repository’s TypeScript compiler requirement from `~6.0.3` to `~5.9.3`.

## [0.2.3] - 2026-05-16

No notable changes.

## [0.2.2] - 2026-05-15

### Documentation

- Update the README’s MIT license URL.

### Maintenance

- Refresh development dependencies and GitHub Actions, migrate to pnpm 11 and its `allowBuilds` configuration, and use `pnpm ci` in CI.
- Pass the npm authentication token directly to the publish command in the release script.

## [0.2.1] - 2026-04-28

### Fixed

- Fix `<FeedKit />` in published installations by importing `getFeedPath` through the package’s public entrypoint.

### Documentation

- Clarify the package and README descriptions to explicitly name RSS, Atom, and JSON feeds.

### Maintenance

- Disable Astro telemetry during CI builds to avoid cleanup crashes on Windows.

## [0.2.0] - 2026-04-28

### Fixed

- Prevent consuming-project build failures by bundling Defuddle and LinkeDOM and distributing compiled ESM entrypoints with TypeScript declarations.

### Documentation

- Credit Defuddle for the rendered-content HTML cleanup pipeline.

### Maintenance

- Refresh the Astro and `@astrojs/check` development requirements.

## [0.1.0] - 2026-04-28

### Added

- Introduce an npm-distributed ESM integration for Astro 6 and Node.js 22.12+, generating RSS 2.0, Atom 1.0, and JSON Feed 1.0 endpoints with configurable filenames and per-format enablement, served during development and prerendered at build time.
- Render full Markdown/MDX content through Astro’s container with automatic or explicit renderer selection, or publish metadata-only feeds with `includeContent: false`.
- Sanitize rendered HTML with Defuddle and remark/rehype, preserving tables and supported media while filtering unsafe markup, restricting iframe hosts, hardening links, and resolving relative URLs.
- Merge multiple content collections with draft exclusion, title/date validation, per-source filtering, sorting and limits, and configurable merged ordering and limits defaulting to the 25 newest items.
- Customize item fields and permalinks through typed `resolveItem({ entry, siteUrl })` callbacks that preserve unspecified defaults, with `tagCategoryResolver` for tag-page URLs.
- Support opt-in HTML-comment or CSS-selector excerpt boundaries with optional default or custom read-more links; publish full content by default.
- Provide `<FeedKit />` for feed discovery links, respecting enabled formats and allowing per-page title overrides.
- Export `defineFeedKitConfig`, `generateFeed`, `getFeedPath`, configuration and item types, and Zod schemas for entries, items, authors, categories, enclosures, and extensions.

### Documentation

- Document installation, integration setup, configuration, public APIs, Starlight integration, and Markdown/MDX excerpt examples.
- Document feed HTML compatibility, sanitizer allowlist decisions, and the post-render cleanup pipeline.
- Mark the project as under development and unsuitable for general use before a 1.0 release.

### Maintenance

- Establish pnpm build and release tooling, shared lint and type checks, tests and benchmarks, and CI across Linux, macOS, and Windows.

[0.1.0]: https://github.com/kitschpatrol/astro-feed-kit/releases/tag/v0.1.0
[0.2.0]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.1.0...v0.2.0
[0.2.1]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.2.0...v0.2.1
[0.2.2]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.2.1...v0.2.2
[0.2.3]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.2.2...v0.2.3
[0.2.4]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.2.3...v0.2.4
[0.3.0]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.2.4...v0.3.0
[0.3.1]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.3.0...v0.3.1
[0.4.0]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.3.1...v0.4.0
[0.4.1]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.4.0...v0.4.1
[0.4.2]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.4.1...v0.4.2
[0.5.0]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.4.2...v0.5.0
[0.5.1]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.5.0...v0.5.1
[0.6.0]: https://github.com/kitschpatrol/astro-feed-kit/compare/v0.5.1...v0.6.0
