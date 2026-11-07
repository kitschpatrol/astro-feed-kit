import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: [
		// Loaded by `astro build` in test/e2e.test.ts, which Knip can't trace
		'test/fixtures/site/**',
		'test/fixtures/site-i18n/**',
	],
	ignoreDependencies: [
		'@kitschpatrol/chagent', // Typically invoked through bumpp's --execute argument, which Knip doesn't parse
	],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
