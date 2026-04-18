import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	entry: ['src/index.ts!', 'src/internal/endpoints/*.ts!', 'src/components/FeedKit.astro!'],
	ignoreDependencies: ['node-addon-api', 'node-gyp'],
	ignoreExportsUsedInFile: true,
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*', 'test/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
