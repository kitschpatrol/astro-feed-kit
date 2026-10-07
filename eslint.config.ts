import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	ignores: [
		// Astro code blocks in markdown aren't part of any tsconfig program
		'**/*.md/*.astro',
		// MDX test fixtures are deliberate ill-formed content (raw HTML,
		// unsafe schemes) that exist to exercise the sanitizer. They aren't
		// part of the tsconfig program and would only produce noise.
		'test/fixtures/mdx/**/*.mdx',
	],
	type: 'lib',
})
