import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'node:child_process';

/** Git SHA stamped on feedback items so an agent knows which build was reviewed. */
const appVersion = (() => {
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		return 'unknown';
	}
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
