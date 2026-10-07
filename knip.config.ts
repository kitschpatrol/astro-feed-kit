import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreExportsUsedInFile: true,
	ignoreWorkspaces: ['playground', 'playground-starlight'],
})
