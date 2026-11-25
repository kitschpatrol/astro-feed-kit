import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'

// Optional — pages without a date (e.g. the splash homepage) are
// skipped by the feed via the `filter` in astro.config.ts.
const dateSchema = z.coerce.date().optional()

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({ date: dateSchema }),
		}),
	}),
}
