import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

export const collections = {
	notes: defineCollection({
		loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
		schema: z.object({
			categories: z.array(z.string()).default([]),
			date: z.coerce.date(),
			summary: z.string(),
			title: z.string(),
		}),
	}),
	posts: defineCollection({
		loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
		schema: z.object({
			date: z.coerce.date(),
			description: z.string(),
			tags: z.array(z.string()).default([]),
			title: z.string(),
		}),
	}),
}
