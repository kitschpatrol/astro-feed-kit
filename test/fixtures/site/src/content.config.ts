import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

export const collections = {
	posts: defineCollection({
		loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
		schema: z.object({
			date: z.coerce.date(),
			description: z.string().optional(),
			draft: z.boolean().optional(),
			tags: z.array(z.string()).optional(),
			title: z.string(),
		}),
	}),
}
