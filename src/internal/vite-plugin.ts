import type { Plugin } from 'vite'

const VIRTUAL_MODULE_ID = 'virtual:astro-feed-kit/config'
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`

/**
 * Symbol identifier for the integration's per-instance config slot on
 * `globalThis`. Exported so the integration factory and the Vite plugin agree
 * on the key shape: `Symbol.for('astro-feed-kit:config:<instanceId>')`.
 */
export function configSymbolKey(instanceId: string): string {
	return `astro-feed-kit:config:${instanceId}`
}

/**
 * Vite plugin that resolves `virtual:astro-feed-kit/config` and loads its
 * value from a `globalThis` slot keyed by `instanceId`. The slot is populated
 * synchronously by the integration factory inside `astro:config:setup`,
 * before Vite ever evaluates the virtual module.
 *
 * Closures and other non-serializable config fields cross the integration ↔
 * Vite boundary by reference because both sides share the same Node process
 * and therefore the same `globalThis`.
 */
export function configBridgePlugin(instanceId: string): Plugin {
	const symbolKey = configSymbolKey(instanceId)
	return {
		load: {
			filter: { id: new RegExp(String.raw`^\0${escapeRegex(VIRTUAL_MODULE_ID)}$`) },
			handler() {
				return `export default globalThis[Symbol.for(${JSON.stringify(symbolKey)})]`
			},
		},
		name: `astro-feed-kit:config:${instanceId}`,
		resolveId: {
			filter: { id: new RegExp(`^${escapeRegex(VIRTUAL_MODULE_ID)}$`) },
			handler() {
				return RESOLVED_VIRTUAL_MODULE_ID
			},
		},
	}
}

function escapeRegex(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
