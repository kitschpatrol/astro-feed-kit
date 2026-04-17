/* eslint-disable ts/no-unused-vars */
/* eslint-disable ts/naming-convention */

import type { AstroIntegration } from 'astro'
import type { FeedConfigInput } from './integration'

/**
 * TODO
 */
export default function feedKit(config?: FeedConfigInput): AstroIntegration {
	return {
		hooks: {
			// eslint-disable-next-line ts/no-empty-function
			'astro:config:setup'() {},
		},
		name: 'astro-feed-kit',
	}
}
