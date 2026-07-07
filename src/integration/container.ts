import type { AstroRenderer } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Probe a renderer package's `getContainerRenderer` export and return the value
 * it produced, or `undefined` if the export is missing or not callable. The
 * caller validates the shape of the returned value with `isAstroRenderer`; we
 * only need a safe way to invoke an untyped function past the lint rules.
 */
function callGetContainerRenderer(module: unknown): unknown {
	if (typeof module !== 'object' || module === null) {
		return undefined
	}

	if (!('getContainerRenderer' in module)) {
		return undefined
	}

	const { getContainerRenderer } = module
	if (typeof getContainerRenderer !== 'function') {
		return undefined
	}

	// `Reflect.apply` keeps the call typed as `unknown` without an assertion
	// on a `Function`-typed value (which eslint flags as unsafe).
	return Reflect.apply(getContainerRenderer, module, [])
}

function isAstroRenderer(value: unknown): value is AstroRenderer {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	if (!('name' in value) || typeof value.name !== 'string') {
		return false
	}

	if (!('serverEntrypoint' in value)) {
		return false
	}

	const { serverEntrypoint } = value
	return typeof serverEntrypoint === 'string' || serverEntrypoint instanceof URL
}

function isModuleNotFound(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false
	}

	if (!('code' in error)) {
		return false
	}

	const { code } = error
	return (
		code === 'ERR_MODULE_NOT_FOUND' ||
		code === 'MODULE_NOT_FOUND' ||
		code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
	)
}

/**
 * Resolve the file behind the first specifier that exists, or `undefined` when
 * none do. Non-not-found resolution failures surface with context, attributed
 * to `pkg`.
 */
function resolveFirstSpecifier(
	requireFromRoot: NodeJS.Require,
	specifiers: string[],
	pkg: string,
): string | undefined {
	for (const specifier of specifiers) {
		try {
			return requireFromRoot.resolve(specifier)
		} catch (error) {
			if (isModuleNotFound(error)) {
				continue
			}

			const message = error instanceof Error ? error.message : String(error)
			throw new Error(
				`astro-feed-kit: failed to resolve renderer package '${pkg}' (via '${specifier}'): ${message}`,
				{ cause: error },
			)
		}
	}

	return undefined
}

/**
 * Probe each of `packages` for a `getContainerRenderer` export and return the
 * resulting `AstroRenderer` descriptors. Bare specifiers are resolved relative
 * to `projectRoot` (the consumer's project root, as a `file://` URL) so linked
 * or symlinked installs of `astro-feed-kit` still find renderer packages in the
 * consumer's `node_modules`.
 *
 * Each package is probed at its `<pkg>/container-renderer` entrypoint first —
 * the dedicated export Astro 7 introduced — falling back to the package root
 * for renderer packages that haven't adopted it. (Astro 7 deprecated calling
 * `getContainerRenderer` from first-party package roots; probing the dedicated
 * entrypoint avoids the runtime deprecation warning.)
 *
 * Missing packages are silently skipped — the point of this helper is to
 * discover whichever subset of known renderers the consumer installed. Other
 * failures (broken package, bad `getContainerRenderer` shape) surface with
 * context.
 *
 * `projectRoot` is typically `fileURLToPath(astroConfig.root)` when called from
 * an integration hook, or `process.cwd()` for standalone callers.
 */
export async function resolveContainerRenderers(
	packages: string[],
	projectRoot: string,
): Promise<AstroRenderer[]> {
	const renderers: AstroRenderer[] = []

	// `createRequire` is Node's ESM-sanctioned way to run `require.resolve`
	// from a chosen base URL. The `import()` that actually loads the module
	// below is still ESM.
	const requireFromRoot = createRequire(pathToFileURL(path.join(projectRoot, 'package.json')).href)

	for (const pkg of packages) {
		const resolvedPath = resolveFirstSpecifier(
			requireFromRoot,
			[`${pkg}/container-renderer`, pkg],
			pkg,
		)
		if (resolvedPath === undefined) {
			continue
		}

		let rendererModule: unknown
		try {
			rendererModule = await import(/* @vite-ignore */ pathToFileURL(resolvedPath).href)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`astro-feed-kit: failed to load renderer package '${pkg}': ${message}`, {
				cause: error,
			})
		}

		const renderer = callGetContainerRenderer(rendererModule)
		if (isAstroRenderer(renderer)) {
			renderers.push(renderer)
		}
	}

	return renderers
}

/**
 * Build an `AstroContainer` seeded with the given renderer descriptors. The
 * container is needed because feed content is rendered outside any normal page
 * context — we ask Astro to render an entry's `Content` component to a string,
 * then sanitize the result.
 */
export async function createContainer(renderers: AstroRenderer[]): Promise<AstroContainer> {
	// `astro:container` is a Vite virtual module — loaded dynamically so the
	// barrel can be safely imported from `astro.config.ts` (where Vite hasn't
	// resolved virtual modules yet) without crashing.
	const { loadRenderers } = await import('astro:container')
	const loaded = await loadRenderers(renderers)
	return AstroContainer.create({ renderers: loaded })
}
