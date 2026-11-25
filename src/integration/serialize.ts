import type { Feed } from 'feed'
import type { FormatFilenames } from './config'

/**
 * Letters, digits, and hyphens: the characters a BCP 47 language tag is built
 * from.
 */
const LANGUAGE_TAG = /^[A-Za-z0-9\-]+$/v

/**
 * Throw unless `language` looks like a BCP 47 language tag such as `en` or
 * `pt-BR`. The tag is written into XML attributes and elements, so anything
 * else is rejected rather than escaped.
 */
export function assertLanguageTag(language: string): void {
	if (!LANGUAGE_TAG.test(language)) {
		throw new Error(
			`astro-feed-kit: feedOptions.language ${JSON.stringify(language)} is not a language tag. ` +
				'Use letters, digits, and hyphens, such as "en" or "pt-BR".',
		)
	}
}

const ATOM_FEED_OPEN_TAG = /<feed\b[^>]*>/v

/**
 * Add `xml:lang` to the `<feed>` element. Left alone when the library already
 * wrote one, so this becomes a no-op once upstream ships language support.
 */
function withAtomLanguage(xml: string, language: string): string {
	const match = ATOM_FEED_OPEN_TAG.exec(xml)
	if (match === null) {
		throw new Error(
			'astro-feed-kit: no <feed> element found in the Atom output to set xml:lang on.',
		)
	}

	const [openTag] = match
	if (openTag.includes('xml:lang=')) {
		return xml
	}

	const tagged = `${openTag.slice(0, -1)} xml:lang="${language}">`
	return xml.slice(0, match.index) + tagged + xml.slice(match.index + openTag.length)
}

const JSON_FEED_1_1 = 'https://jsonfeed.org/version/1.1'

/**
 * Add the top-level `language` field. JSON Feed 1.0 has no such field, so the
 * document is declared as 1.1, which is otherwise identical. Left alone when
 * the library already wrote one.
 */
function withJsonLanguage(json: string, language: string): string {
	const parsed = JSON.parse(json) as Record<string, unknown>
	if ('language' in parsed) {
		return json
	}

	// `version` keeps its place at the top; `language` lands just before `items`.
	const { items, ...rest } = parsed
	rest.version = JSON_FEED_1_1
	rest.language = language
	return JSON.stringify({ ...rest, items }, undefined, 4)
}

const SERIALIZERS: Record<
	keyof FormatFilenames,
	(feed: Feed, language: string | undefined) => string
> = {
	atom: (feed, language) =>
		language === undefined ? feed.atom1() : withAtomLanguage(feed.atom1(), language),
	json: (feed, language) =>
		language === undefined ? feed.json1() : withJsonLanguage(feed.json1(), language),
	rss: (feed) => feed.rss2(),
}

/**
 * Serialize `feed` as one format, adding the language output the `feed` library
 * leaves out. The library writes `feedOptions.language` only into RSS 2.0's
 * `<language>` element. Atom's `xml:lang` attribute and JSON Feed's `language`
 * field have been pending upstream since
 * https://github.com/jpmonette/feed/issues/196, so they are added here. Remove
 * once the library emits them itself.
 */
export function serializeFeed(feed: Feed, kind: keyof FormatFilenames): string {
	const { language } = feed.options
	if (language !== undefined) {
		assertLanguageTag(language)
	}

	return SERIALIZERS[kind](feed, language)
}
