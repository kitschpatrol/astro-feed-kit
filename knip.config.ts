import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	entry: ['src/index.ts!', 'src/internal/endpoints/*.ts!', 'src/components/FeedKit.astro!'],
	// Required at install time when a transitive dep triggers a native build,
	// even though no source imports them directly.
	ignoreDependencies: ['node-addon-api', 'node-gyp'],
	ignoreExportsUsedInFile: true,
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*', 'test/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
