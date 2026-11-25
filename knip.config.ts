import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: [
		// Loaded by `astro build` in test/e2e.test.ts, which Knip can't trace
		'test/fixtures/site/**',
		'test/fixtures/site-i18n/**',
		// Read from disk by test/mdx.test.ts, not imported
		'test/fixtures/mdx/**',
	],
	ignoreDependencies: [
		'@astrojs/mdx', // Used by the e2e fixture sites above
		'@kitschpatrol/chagent', // Typically invoked through bumpp's --execute argument, which Knip doesn't parse
	],
	ignoreWorkspaces: [
		'playground',
		'playground-i18n',
		'playground-starlight',
		'playground-starlight-i18n',
	],
})
