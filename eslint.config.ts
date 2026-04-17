import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: {
			overrides: {
				// Remove in next shared-config release
				'perfectionist/sort-intersection-types': [
					'error',
					{
						groups: [
							'named',
							'union',
							'intersection',
							'conditional',
							'function',
							'import',
							'keyword',
							'operator',
							'literal',
							'tuple',
							'object', // Last, otherwise esbuild will choke on `&` characters
						],
					},
				],
			},
		},
		ignores: [
			// Directives and attributes make a mess of MDX linting
			'playground/**/*.mdx',
			'playground-starlight/**/*.mdx',
			// Astro code blocks in markdown aren't part of any tsconfig program
			'**/*.md/*.astro',
		],
		type: 'lib',
	},
	{
		files: ['package.json'],
		rules: {
			// TODO remove once all packages point to NPM
			'json-package/valid-dependencies': 'off',
		},
	},
	{
		// Unpublished workspace packages...
		files: ['*/package.json'],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
