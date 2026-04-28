import { remarkConfig } from '@kitschpatrol/remark-config'

export default remarkConfig({
	rules: [
		// Issues validating absolute links in the Starlight playground...
		['remarkValidateLinks', { repository: false }],
		['remark-lint-first-heading-level', false],
	],
})
