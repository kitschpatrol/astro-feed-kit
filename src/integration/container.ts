import type { AstroRenderer } from 'astro'
import { loadRenderers } from 'astro:container'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'

/**
 * Build an `AstroContainer` seeded with whichever of the given renderer
 * packages are installed. Each package is dynamically imported; missing
 * packages are silently skipped so the same configuration can be reused
 * across projects that use different subsets of Astro renderers (MDX,
 * React, Preact, Svelte, Vue, Solid, Lit, …).
 *
 * The container is needed because feed content is rendered outside any
 * normal page context — we ask Astro to render an entry's `Content`
 * component to a string, then sanitize the result.
 */
export async function createContainer(knownRenderers: string[]): Promise<AstroContainer> {
	const containerRenderers: AstroRenderer[] = []

	for (const pkg of knownRenderers) {
		try {
			// eslint-disable-next-line ts/no-unsafe-assignment
			const rendererModule = await import(/* @vite-ignore */ pkg)
			// eslint-disable-next-line ts/no-unsafe-member-access
			if (typeof rendererModule.getContainerRenderer === 'function') {
				// eslint-disable-next-line ts/no-unsafe-argument, ts/no-unsafe-call, ts/no-unsafe-member-access
				containerRenderers.push(rendererModule.getContainerRenderer())
			}
		} catch {
			// Package is not installed in this project — skip silently.
		}
	}

	const renderers = await loadRenderers(containerRenderers)
	return AstroContainer.create({ renderers })
}
