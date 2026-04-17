import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				// Optional — pages without a date (e.g. the splash homepage) are
				// skipped by the feed via the `filter` in astro.config.ts.
				date: z.coerce.date().optional(),
			}),
		}),
	}),
}
