import { defineConfig } from 'vitest/config'

export default defineConfig({
	define: {
		'import.meta.env.BASE_URL': JSON.stringify('/'),
	},
	test: {
		include: ['test/**/*.test.ts'],
	},
})
