// Renderer probing resolves real packages from a project root. Each test
// project is a temporary directory with hand-written packages in
// `node_modules`, so module resolution runs for real instead of being mocked.

import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveContainerRenderers } from '../src/integration/container'

const CONTAINER_MODULE_URL = new URL('../src/integration/container.ts', import.meta.url).href

type FakePackage = {
	files: Record<string, string>
	manifest: Record<string, unknown> | string
}

function rendererModule(name: string, serverEntrypoint = `'${name}/server.js'`): string {
	return `export function getContainerRenderer() {
	return { name: '${name}', serverEntrypoint: ${serverEntrypoint} }
}
`
}

const PACKAGES: Record<string, FakePackage> = {
	'broken-package-json': {
		files: { 'index.js': rendererModule('broken-package-json') },
		manifest: '{ not json',
	},
	'invalid-shape': {
		files: { 'index.js': 'export function getContainerRenderer() { return { name: 1 } }\n' },
		manifest: { exports: { '.': './index.js' }, type: 'module' },
	},
	'no-export': {
		files: { 'index.js': 'export const unrelated = true\n' },
		manifest: { exports: { '.': './index.js' }, type: 'module' },
	},
	'root-only-exports': {
		files: {
			'index.js': rendererModule('root-only-exports', "new URL('file:///server.js')"),
		},
		manifest: { exports: { '.': './index.js' }, type: 'module' },
	},
	'root-only-main': {
		files: { 'index.js': rendererModule('root-only-main') },
		manifest: { main: 'index.js', type: 'module' },
	},
	'subpath-renderer': {
		files: {
			'container-renderer.js': rendererModule('subpath-renderer'),
			'index.js': rendererModule('subpath-renderer-root'),
		},
		manifest: {
			exports: { '.': './index.js', './container-renderer': './container-renderer.js' },
			type: 'module',
		},
	},
	'throws-on-import': {
		files: { 'index.js': "throw new Error('boom')\n" },
		manifest: { exports: { '.': './index.js' }, type: 'module' },
	},
}

let tempRoot: string
let projectRoot: string

async function writePackage(root: string, name: string, fake: FakePackage): Promise<void> {
	const directory = path.join(root, 'node_modules', name)
	await mkdir(directory, { recursive: true })
	const manifest =
		typeof fake.manifest === 'string' ? fake.manifest : JSON.stringify({ name, ...fake.manifest })
	await writeFile(path.join(directory, 'package.json'), manifest)
	for (const [file, contents] of Object.entries(fake.files)) {
		await writeFile(path.join(directory, file), contents)
	}
}

beforeAll(async () => {
	tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-feed-kit-renderers-'))
	projectRoot = path.join(tempRoot, 'project')
	await mkdir(projectRoot, { recursive: true })
	await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'project' }))

	for (const [name, fake] of Object.entries(PACKAGES)) {
		await writePackage(projectRoot, name, fake)
	}
})

afterAll(async () => {
	await rm(tempRoot, { force: true, recursive: true })
})

describe('resolveContainerRenderers', () => {
	it('prefers the container-renderer entrypoint and falls back to the package root', async () => {
		// These packages exist only under projectRoot, not under the working
		// directory, so finding them shows resolution is anchored there.
		const renderers = await resolveContainerRenderers(
			['subpath-renderer', 'root-only-exports', 'root-only-main'],
			projectRoot,
		)
		expect(renderers.map((renderer) => renderer.name)).toEqual([
			'subpath-renderer',
			'root-only-exports',
			'root-only-main',
		])
	})

	it('accepts a URL serverEntrypoint', async () => {
		const [renderer] = await resolveContainerRenderers(['root-only-exports'], projectRoot)
		expect(renderer?.serverEntrypoint).toBeInstanceOf(URL)
	})

	it('skips packages that are not installed', async () => {
		await expect(resolveContainerRenderers(['not-installed'], projectRoot)).resolves.toEqual([])
	})

	it('skips packages without a usable getContainerRenderer export', async () => {
		await expect(
			resolveContainerRenderers(['no-export', 'invalid-shape'], projectRoot),
		).resolves.toEqual([])
	})

	it('ignores renderer packages reachable only through NODE_PATH', async () => {
		const globalRoot = path.join(tempRoot, 'global')
		await writePackage(globalRoot, 'global-only-renderer', {
			files: { 'index.js': rendererModule('global-only-renderer') },
			manifest: { exports: { '.': './index.js' }, type: 'module' },
		})

		// Node reads NODE_PATH once at startup, so the probe runs in a child
		// process. pnpm's bin shims set NODE_PATH the same way.
		const script = `
import { resolveContainerRenderers } from ${JSON.stringify(CONTAINER_MODULE_URL)}
const renderers = await resolveContainerRenderers(
	['global-only-renderer', 'root-only-main'],
	${JSON.stringify(projectRoot)},
)
console.log(JSON.stringify(renderers.map((renderer) => renderer.name)))
`
		const env = {
			...process.env,
			// eslint-disable-next-line ts/naming-convention -- Environment variable name
			NODE_PATH: path.join(globalRoot, 'node_modules'),
		}
		const stdout = execFileSync(
			process.execPath,
			['--no-warnings', '--input-type=module', '--eval', script],
			{ encoding: 'utf8', env },
		)
		expect(JSON.parse(stdout)).toEqual(['root-only-main'])
	})

	it('reports packages that fail to load, naming the package', async () => {
		await expect(resolveContainerRenderers(['throws-on-import'], projectRoot)).rejects.toThrow(
			"astro-feed-kit: failed to load renderer package 'throws-on-import': boom",
		)
	})

	it('reports resolution failures other than not-found, naming the package', async () => {
		await expect(resolveContainerRenderers(['broken-package-json'], projectRoot)).rejects.toThrow(
			"astro-feed-kit: failed to resolve renderer package 'broken-package-json'",
		)
	})
})
