/**
 * Astro's `i18n` settings, as far as feeds are concerned. Astro's resolved
 * `AstroConfig['i18n']` satisfies this shape, and standalone callers can write
 * the three fields by hand.
 */
export type AstroI18nOptions = {
	defaultLocale: string
	locales: Array<string | { codes: [string, ...string[]]; path: string }>
	routing?: 'manual' | { prefixDefaultLocale?: boolean }
}

/**
 * One locale of an Astro i18n site, as the feed pipeline sees it.
 */
export type LocaleInfo = {
	/**
	 * Language tag written to the feed: the locale string, or the first code of a
	 * `{ codes, path }` locale.
	 */
	code: string
	/**
	 * Every code that names this locale. `Astro.currentLocale` can return any of
	 * them.
	 */
	codes: string[]
	isDefault: boolean
	/** URL segment and content folder name. */
	path: string
	/**
	 * URL prefix relative to the site root: `''` for the default locale unless
	 * Astro's `prefixDefaultLocale` is set, otherwise `${path}/`.
	 */
	prefix: string
}

/**
 * Normalize Astro's `i18n` config into one record per locale. Follows Astro's
 * own URL rule: only the default locale goes unprefixed, and only when
 * `routing.prefixDefaultLocale` is off.
 */
export function resolveLocales(i18n: AstroI18nOptions): LocaleInfo[] {
	const { routing } = i18n
	const prefixDefault =
		routing !== undefined && routing !== 'manual' && routing.prefixDefaultLocale === true

	const locales = i18n.locales.map((locale): LocaleInfo => {
		const codes: [string, ...string[]] = typeof locale === 'string' ? [locale] : locale.codes
		const path = typeof locale === 'string' ? locale : locale.path
		const isDefault = path === i18n.defaultLocale || codes.includes(i18n.defaultLocale)
		return {
			code: codes[0],
			codes,
			isDefault,
			path,
			prefix: isDefault && !prefixDefault ? '' : `${path}/`,
		}
	})

	const defaults = locales.filter((locale) => locale.isDefault)
	if (defaults.length !== 1) {
		throw new Error(
			`astro-feed-kit: i18n.defaultLocale ${JSON.stringify(i18n.defaultLocale)} must match ` +
				`exactly one entry in i18n.locales, but matched ${defaults.length}.`,
		)
	}

	return locales
}

/** The locale named by `value`, matched against each locale's path and codes. */
export function findLocale<T extends LocaleInfo>(
	locales: readonly T[],
	value: string,
): T | undefined {
	return locales.find((locale) => locale.path === value || locale.codes.includes(value))
}

/** The default locale. `resolveLocales` guarantees there is exactly one. */
export function defaultLocale<T extends LocaleInfo>(locales: readonly T[]): T {
	const found = locales.find((locale) => locale.isDefault)
	if (found === undefined) {
		throw new Error('astro-feed-kit: no locale is marked as the default.')
	}

	return found
}

/**
 * Which locale an entry belongs to, and its id without the locale folder.
 * Astro's i18n recipe keeps translated content in one folder per locale, so an
 * id like `fr/hello` belongs to `fr` with slug `hello`. Ids without a locale
 * folder, such as Starlight's root-locale docs, belong to the default locale
 * and keep the whole id as their slug.
 */
export function entryLocale<T extends LocaleInfo>(
	id: string,
	locales: readonly T[],
): { locale: T; slug: string } {
	const separator = id.indexOf('/')
	if (separator > 0) {
		const folder = id.slice(0, separator)
		const locale = locales.find((candidate) => candidate.path === folder)
		if (locale !== undefined) {
			return { locale, slug: id.slice(separator + 1) }
		}
	}

	return { locale: defaultLocale(locales), slug: id }
}
