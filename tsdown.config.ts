import { defineConfig } from 'tsdown'

export default defineConfig({
	deps: {
		neverBundle: [/^astro:/v, /^virtual:/v],
	},
	dts: true,
	entry: [
		'src/index.ts',
		'src/internal/endpoints/atom.ts',
		'src/internal/endpoints/json.ts',
		'src/internal/endpoints/rss.ts',
	],
	fixedExtension: false,
	format: 'esm',
	outDir: 'dist',
	sourcemap: true,
	target: 'node22',
})
