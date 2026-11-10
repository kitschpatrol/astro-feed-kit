import { describe, expect, it } from 'vitest'
import {
	defaultLocale,
	entryLocale,
	findLocale,
	resolveLocales,
	toManifestI18n,
} from '../src/integration/locale'

const EN_FR = { defaultLocale: 'en', locales: ['en', 'fr'] }

describe('resolveLocales', () => {
	it('leaves the default locale unprefixed and prefixes the rest', () => {
		expect(resolveLocales(EN_FR)).toEqual([
			{ code: 'en', codes: ['en'], isDefault: true, path: 'en', prefix: '' },
			{ code: 'fr', codes: ['fr'], isDefault: false, path: 'fr', prefix: 'fr/' },
		])
	})

	it('prefixes the default locale when prefixDefaultLocale is set', () => {
		const [en] = resolveLocales({ ...EN_FR, routing: { prefixDefaultLocale: true } })
		expect(en?.prefix).toBe('en/')
	})

	it.each([
		['manual', 'manual'],
		['an empty routing object', {}],
		['prefixDefaultLocale false', { prefixDefaultLocale: false }],
	] as const)('leaves the default locale unprefixed with routing %s', (_label, routing) => {
		const [en] = resolveLocales({ ...EN_FR, routing })
		expect(en?.prefix).toBe('')
	})

	it('uses the first code as the language tag and the path for URLs', () => {
		const [en, italian] = resolveLocales({
			defaultLocale: 'en',
			locales: ['en', { codes: ['it', 'it-VT'], path: 'italian' }],
		})
		expect(en?.isDefault).toBe(true)
		expect(italian).toEqual({
			code: 'it',
			codes: ['it', 'it-VT'],
			isDefault: false,
			path: 'italian',
			prefix: 'italian/',
		})
	})

	it.each(['italian', 'it', 'it-VT'])('matches defaultLocale %j to a custom locale', (value) => {
		const [italian] = resolveLocales({
			defaultLocale: value,
			locales: [{ codes: ['it', 'it-VT'], path: 'italian' }, 'en'],
		})
		expect(italian?.isDefault).toBe(true)
		expect(italian?.prefix).toBe('')
	})

	it('fails when defaultLocale is not one of the locales', () => {
		expect(() => resolveLocales({ defaultLocale: 'de', locales: ['en', 'fr'] })).toThrow(
			'i18n.defaultLocale "de" must match exactly one entry in i18n.locales, but matched 0',
		)
	})
})

describe('findLocale and defaultLocale', () => {
	const locales = resolveLocales({
		defaultLocale: 'en',
		locales: ['en', { codes: ['it', 'it-VT'], path: 'italian' }],
	})

	it.each([
		['en', 'en'],
		['italian', 'it'],
		['it', 'it'],
		['it-VT', 'it'],
	])('finds %j as locale %j', (value, code) => {
		expect(findLocale(locales, value)?.code).toBe(code)
	})

	it('returns undefined for an unknown locale', () => {
		expect(findLocale(locales, 'de')).toBeUndefined()
	})

	it('returns the default locale', () => {
		expect(defaultLocale(locales).code).toBe('en')
	})

	it('fails when no locale is the default', () => {
		expect(() => defaultLocale([])).toThrow('no locale is marked as the default')
	})
})

describe('entryLocale', () => {
	const locales = resolveLocales({
		defaultLocale: 'en',
		locales: ['en', 'fr', { codes: ['it'], path: 'italian' }],
	})

	it.each([
		['fr/hello', 'fr', 'hello'],
		['fr/nested/deep', 'fr', 'nested/deep'],
		['italian/ciao', 'it', 'ciao'],
		['en/hello', 'en', 'hello'],
	])('places %j in locale %j with slug %j', (id, code, slug) => {
		const result = entryLocale(id, locales)
		expect(result.locale.code).toBe(code)
		expect(result.slug).toBe(slug)
	})

	it.each(['hello', 'de/hello', 'fr', 'docs/fr/hello'])(
		'places %j in the default locale with its whole id as the slug',
		(id) => {
			const result = entryLocale(id, locales)
			expect(result.locale.code).toBe('en')
			expect(result.slug).toBe(id)
		},
	)
})

describe('toManifestI18n', () => {
	const locales = ['en', { codes: ['it', 'it-VT'] as [string, ...string[]], path: 'italian' }]

	it('names the default locale by path and leaves it unprefixed by default', () => {
		expect(toManifestI18n(resolveLocales({ defaultLocale: 'en', locales }))).toEqual({
			defaultLocale: 'en',
			domainLookupTable: {},
			domains: undefined,
			fallback: undefined,
			fallbackType: 'redirect',
			locales: [
				{ codes: ['en'], path: 'en' },
				{ codes: ['it', 'it-VT'], path: 'italian' },
			],
			strategy: 'pathname-prefix-other-locales',
		})
	})

	it('switches to the always-prefixed strategy when the default locale has a prefix', () => {
		const manifest = toManifestI18n(
			resolveLocales({ defaultLocale: 'italian', locales, routing: { prefixDefaultLocale: true } }),
		)
		expect(manifest.defaultLocale).toBe('italian')
		expect(manifest.strategy).toBe('pathname-prefix-always-no-redirect')
	})
})
