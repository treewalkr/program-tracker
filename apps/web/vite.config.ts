import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// the file itself, not @pt/shared: the config loads under plain Node, which can't resolve the package's extensionless imports
import { buildId } from '../../packages/shared/src/build';

/** Build ID ("0.1.3+42a93f5") — shown in the sidebar and stamped on feedback items. */
const appVersion = (() => {
	const root = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
	let sha: string | null = null;
	try {
		sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		// no git (e.g. a source tarball) — version only
	}
	return buildId(root.version, sha);
})();

export default defineConfig(({ mode }) => ({
	define: { __APP_VERSION__: JSON.stringify(appVersion) },
	server: {
		host: true,
		allowedHosts: ['.ts.net'],
		proxy: { '/v1': process.env.API_PROXY_TARGET ?? loadEnv(mode, process.cwd(), '').PUBLIC_API_URL ?? 'http://localhost:4000' }
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter({ fallback: 'index.html' })
		})
	]
}));
