/* eslint-disable ts/naming-convention */

// Zod schemas mirroring the shapes produced/consumed by the `feed` library,
// plus a minimal contract that content entries must satisfy to be eligible
// for inclusion in a feed. See https://github.com/jpmonette/feed for the
// library's own type definitions.

import { z } from 'astro/zod'

const EnclosureSchema = z.object({
	duration: z.number().nonnegative().optional(),
	length: z.number().int().nonnegative().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	url: z.url(),
})

const AuthorSchema = z.object({
	avatar: z.url().optional(),
	email: z.email().optional(),
	link: z.url().optional(),
	name: z.string().optional(),
})

const CategorySchema = z.object({
	domain: z.string().optional(),
	name: z.string().optional(),
	scheme: z.string().optional(),
	term: z.string().optional(),
})

const ExtensionSchema = z.object({
	name: z.string(),
	objects: z.record(z.string(), z.unknown()),
})

// Accepts a URL string OR an Enclosure object
const MediaSchema = z.union([z.url(), EnclosureSchema])

// Coerce Date — accepts Date instances or ISO strings/timestamps
const DateSchema = z.coerce.date()

/**
 * Zod schema mirroring the `Item` shape consumed by the `feed` library. Used to
 * validate the resolved item produced by the resolver pipeline before it is
 * handed to `feed.addItem()`.
 */
export const ItemSchema = z.looseObject({
	audio: MediaSchema.optional(),
	author: z.array(AuthorSchema).optional(),
	category: z.array(CategorySchema).optional(),
	content: z.string().optional(),
	contributor: z.array(AuthorSchema).optional(),
	copyright: z.string().optional(),
	date: DateSchema,
	description: z.string().optional(),
	enclosure: EnclosureSchema.optional(),
	extensions: z.array(ExtensionSchema).optional(),
	guid: z.string().optional(),
	id: z.string().optional(),
	image: MediaSchema.optional(),
	link: z.url(),
	published: DateSchema.optional(),
	title: z.string().min(1),
	video: MediaSchema.optional(),
})

/**
 * Minimal contract that a content entry's `data` must satisfy to be eligible
 * for inclusion in a feed. Enforced inside `getFeedContent` so that every entry
 * reaching the resolver pipeline has at least a title and a date; everything
 * else is populated (or overridden) by resolvers.
 */
export const FeedEligibleEntrySchema = z.looseObject({
	date: DateSchema,
	title: z.string().min(1),
})

export type Item = z.infer<typeof ItemSchema>
export type FeedEligibleEntry = z.infer<typeof FeedEligibleEntrySchema>

export { AuthorSchema, CategorySchema, EnclosureSchema, ExtensionSchema }
