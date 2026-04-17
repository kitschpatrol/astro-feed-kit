// Public surface for feed-kit. Consuming code should import from here
// rather than reaching into the individual modules, so that the set of
// stable identifiers is explicit in one place.

export type {
	CollectionConfig,
	EntryResolver,
	ExcerptBoundary,
	FeedConfig,
	FeedConfigInput,
	FeedFilenames,
	ItemResolvers,
	LinkContext,
	ResolverContext,
} from './config'
export { defineFeedConfig, getFeedPath } from './config'
export { generateFeed } from './feed'
export { applyResolvers, tagCategoryResolver } from './item-map'
export type { FeedEligibleEntry, Item } from './schemas'
export { FeedEligibleEntrySchema, ItemSchema } from './schemas'
