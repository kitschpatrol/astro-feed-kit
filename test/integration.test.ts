// Drives the integration's Astro hooks with stand-ins for the arguments Astro
// passes, then reads the resolved config back through the real Vite plugin
// the hook registers, the same way the injected endpoints do.

import type { AstroIntegration } from 'astro'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { FeedKitConfig, ResolvedFeedKitConfig } from '../src/integration/config'
import type { AstroI18nOptions } from '../src/integration/locale'
import feedKit from '../src/index'

type AstroSettings = {
	base?: string
	format?: 'directory' | 'file' | 'preserve'
	i18n?: AstroI18nOptions
	site?: string | undefined
	trailingSlash?: 'always' | 'ignore' | 'never'
}

const PROJECT_ROOT = pathToFileURL(path.join(path.sep, 'projects', 'site', path.sep))

const baseFeedOptions = { description: 'd', title: 't' }

const baseInput: FeedKitConfig = {
	feedOptions: baseFeedOptions,
	sources: ['posts'],
}

const EN_FR: AstroI18nOptions = { defaultLocale: 'en', locales: ['en', 'fr'] }

/** Run `astro:config:setup` and capture everything the hook hands back to Astro. */
function setup(input: FeedKitConfig, settings: AstroSettings = {}) {
	type SetupOptions = Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0]
	const injectRoute = vi.fn<SetupOptions['injectRoute']>()
	const updateConfig = vi.fn<SetupOptions['updateConfig']>()
	const logger = { info: vi.fn(), warn: vi.fn() }
	const options = {
		config: {
			base: settings.base ?? '/',
			build: { format: settings.format ?? 'directory' },
			i18n: settings.i18n,
			root: PROJECT_ROOT,
			site: 'site' in settings ? settings.site : 'https://example.com',
			trailingSlash: settings.trailingSlash ?? 'ignore',
		},
		injectRoute,
		logger,
		updateConfig,
	} as unknown as SetupOptions

	void feedKit(input).hooks['astro:config:setup']?.(options)
	return { injectRoute, logger, updateConfig }
}

/**
 * Load the `virtual:astro-feed-kit/config` module through the registered
 * plugin.
 */
async function loadVirtualConfig(
	updateConfig: ReturnType<typeof setup>['updateConfig'],
): Promise<ResolvedFeedKitConfig> {
	const { load, resolveId } = updateConfig.mock.calls[0]?.[0].vite?.plugins?.[0] as unknown as {
		load: { handler: () => string }
		resolveId: { filter: { id: RegExp }; handler: () => string }
	}
	expect(resolveId.filter.id.test('virtual:astro-feed-kit/config')).toBe(true)
	expect(resolveId.handler()).toBe('\0virtual:astro-feed-kit/config')

	const code = load.handler()
	const module = (await import(
		/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`
	)) as { default: ResolvedFeedKitConfig }
	return module.default
}

function injectedRoutes(injectRoute: ReturnType<typeof setup>['injectRoute']) {
	return injectRoute.mock.calls.map(([route]) => ({
		endpoint: path.basename(route.entrypoint.toString()),
		pattern: route.pattern,
		prerender: route.prerender,
	}))
}

describe('feedKit integration: astro:config:setup', () => {
	it('injects one prerendered endpoint route per format', () => {
		const { injectRoute, logger } = setup(baseInput)
		expect(injectedRoutes(injectRoute)).toEqual([
			{ endpoint: 'atom.js', pattern: '/atom.xml', prerender: true },
			{ endpoint: 'json.js', pattern: '/feed.json', prerender: true },
			{ endpoint: 'rss.js', pattern: '/rss.xml', prerender: true },
		])
		expect(logger.info).toHaveBeenCalledWith(
			'mounted feed endpoints: /atom.xml, /feed.json, /rss.xml',
		)
	})

	it('points each route at the packaged endpoint entrypoint', () => {
		const { injectRoute } = setup(baseInput)
		for (const [route] of injectRoute.mock.calls) {
			const entrypoint = route.entrypoint.toString()
			expect(path.isAbsolute(entrypoint)).toBe(true)
			expect(path.dirname(entrypoint).endsWith(path.join('internal', 'endpoints'))).toBe(true)
		}
	})

	it('uses custom filenames and skips disabled formats', () => {
		const { injectRoute } = setup({ ...baseInput, formats: { atom: false, rss: 'feed.xml' } })
		expect(injectedRoutes(injectRoute).map((route) => route.pattern)).toEqual([
			'/feed.json',
			'/feed.xml',
		])
	})

	it('warns and injects nothing when every format is disabled', () => {
		const { injectRoute, logger } = setup({
			...baseInput,
			formats: { atom: false, json: false, rss: false },
		})
		expect(injectRoute).not.toHaveBeenCalled()
		expect(logger.warn).toHaveBeenCalledOnce()
		expect(logger.info).not.toHaveBeenCalled()
	})

	it('keeps route patterns base-relative and logs the paths under base', () => {
		const { injectRoute, logger } = setup(baseInput, { base: '/blog' })
		expect(injectedRoutes(injectRoute).map((route) => route.pattern)).toEqual([
			'/atom.xml',
			'/feed.json',
			'/rss.xml',
		])
		expect(logger.info).toHaveBeenCalledWith(
			'mounted feed endpoints: /blog/atom.xml, /blog/feed.json, /blog/rss.xml',
		)
	})

	it('exposes the resolved config, with Astro site settings, through the virtual module', async () => {
		const { updateConfig } = setup(baseInput, {
			base: '/blog',
			site: 'https://example.com',
			trailingSlash: 'never',
		})
		const config = await loadVirtualConfig(updateConfig)

		expect(config.feedOptions.link).toBe('https://example.com/blog/')
		expect(config.feedOptions.feedLinks?.rss).toBe('https://example.com/blog/rss.xml')
		expect(config.base).toBe('/blog/')
		expect(config.appendTrailingSlash).toBe(false)
		expect(config.projectRoot).toBe(fileURLToPath(PROJECT_ROOT))
		expect(config.sources).toEqual([{ collection: 'posts' }])
	})

	it('derives trailing slashes from build.format when trailingSlash is ignore', async () => {
		const { updateConfig } = setup(baseInput, { format: 'file', trailingSlash: 'ignore' })
		const config = await loadVirtualConfig(updateConfig)
		expect(config.appendTrailingSlash).toBe(false)
	})

	it('prefers an explicit feedOptions.link over the Astro site', async () => {
		const { updateConfig } = setup({
			...baseInput,
			feedOptions: { ...baseFeedOptions, link: 'https://feeds.example.org' },
		})
		const config = await loadVirtualConfig(updateConfig)
		expect(config.feedOptions.link).toBe('https://feeds.example.org/')
	})

	it('fails fast when neither feedOptions.link nor the Astro site is set', () => {
		expect(() => setup(baseInput, { site: undefined })).toThrow(
			'feedOptions.link was not provided and astro config has no `site` URL set',
		)
	})
})

describe('feedKit integration: i18n', () => {
	it('injects one set of endpoints per locale, the unprefixed default locale first', () => {
		const { injectRoute, logger } = setup({ ...baseInput, i18n: true }, { i18n: EN_FR })
		expect(injectedRoutes(injectRoute)).toEqual([
			{ endpoint: 'atom.js', pattern: '/atom.xml', prerender: true },
			{ endpoint: 'json.js', pattern: '/feed.json', prerender: true },
			{ endpoint: 'rss.js', pattern: '/rss.xml', prerender: true },
			{ endpoint: 'atom.js', pattern: '/fr/atom.xml', prerender: true },
			{ endpoint: 'json.js', pattern: '/fr/feed.json', prerender: true },
			{ endpoint: 'rss.js', pattern: '/fr/rss.xml', prerender: true },
		])
		expect(logger.info).toHaveBeenCalledWith(
			'mounted feed endpoints: /atom.xml, /feed.json, /rss.xml, /fr/atom.xml, /fr/feed.json, /fr/rss.xml',
		)
	})

	it('prefixes every locale when prefixDefaultLocale is set, logging paths under base', () => {
		const { injectRoute, logger } = setup(
			{ ...baseInput, formats: { atom: false, json: false }, i18n: true },
			{ base: '/blog', i18n: { ...EN_FR, routing: { prefixDefaultLocale: true } } },
		)
		expect(injectedRoutes(injectRoute).map((route) => route.pattern)).toEqual([
			'/en/rss.xml',
			'/fr/rss.xml',
		])
		expect(logger.info).toHaveBeenCalledWith(
			'mounted feed endpoints: /blog/en/rss.xml, /blog/fr/rss.xml',
		)
	})

	it('exposes every locale through the virtual module, described for the default one', async () => {
		const { updateConfig } = setup({ ...baseInput, i18n: true }, { i18n: EN_FR })
		const config = await loadVirtualConfig(updateConfig)
		expect(config.locales?.map((locale) => locale.code)).toEqual(['en', 'fr'])
		expect(config.locale?.code).toBe('en')
		expect(config.feedOptions.language).toBe('en')
		expect(config.feedOptions.link).toBe('https://example.com/')
		expect(config.locales?.[1]?.feedOptions.link).toBe('https://example.com/fr/')
	})

	it('ignores Astro i18n settings unless i18n is enabled', async () => {
		const { injectRoute, updateConfig } = setup(baseInput, { i18n: EN_FR })
		expect(injectRoute).toHaveBeenCalledTimes(3)
		const config = await loadVirtualConfig(updateConfig)
		expect(config.locales).toBeUndefined()
		expect(config.feedOptions.language).toBeUndefined()
	})

	it('fails fast when i18n is enabled without Astro i18n settings', () => {
		expect(() => setup({ ...baseInput, i18n: true })).toThrow(
			"`i18n: true` needs Astro's `i18n` config",
		)
	})
})

describe('feedKit integration: astro:config:done', () => {
	it('declares types for the virtual config module', () => {
		type DoneOptions = Parameters<NonNullable<AstroIntegration['hooks']['astro:config:done']>>[0]
		const injectTypes = vi.fn<DoneOptions['injectTypes']>()
		void feedKit(baseInput).hooks['astro:config:done']?.({ injectTypes } as unknown as DoneOptions)

		expect(injectTypes).toHaveBeenCalledOnce()
		const [declaration] = injectTypes.mock.calls[0]!
		expect(declaration.filename).toBe('astro-feed-kit.d.ts')
		expect(declaration.content).toContain("declare module 'virtual:astro-feed-kit/config'")
		expect(declaration.content).toContain("import('astro-feed-kit').ResolvedFeedKitConfig")
	})
})
