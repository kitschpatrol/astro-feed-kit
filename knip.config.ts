import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	entry: ['src/index.ts!', 'src/internal/endpoints/*.ts!', 'src/components/FeedKit.astro!'],
	// `@astrojs/check` makes `ksc-typescript` run `astro check` here (which
	// covers `src/components/FeedKit.astro`) instead of `tsc`. The native build
	// deps are required at install time when a transitive dep triggers a native
	// build, even though no source imports them directly.
	ignoreDependencies: ['@astrojs/check', 'node-addon-api', 'node-gyp'],
	ignoreExportsUsedInFile: true,
	ignoreFiles: ['playground/**/*', 'playground-starlight/**/*', 'test/**/*'],
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
