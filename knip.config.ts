import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: [
		'test/fixtures/site/**', // Loaded by `astro build` in test/e2e.test.ts, which Knip can't trace
	],
	ignoreDependencies: [
		'@kitschpatrol/chagent', // Typically invoked through bumpp's --execute argument, which Knip doesn't parse
	],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
