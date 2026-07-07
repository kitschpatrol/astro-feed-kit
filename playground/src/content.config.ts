import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const stringList = z.array(z.string()).default([])

export const collections = {
	notes: defineCollection({
		loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
		schema: z.object({
			categories: stringList,
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
			tags: stringList,
			title: z.string(),
		}),
	}),
}
