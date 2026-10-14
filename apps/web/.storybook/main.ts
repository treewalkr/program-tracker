import type { StorybookConfig } from '@storybook/sveltekit';

import { dirname } from 'path';
import { fileURLToPath } from 'url';

/** Resolves package paths for monorepo setups. */
function getAbsolutePath(value: string) {
	return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.svelte'],
	addons: [
		getAbsolutePath('@storybook/addon-svelte-csf'),
		getAbsolutePath('@storybook/addon-a11y'),
		getAbsolutePath('@storybook/addon-docs'),
	],
	framework: getAbsolutePath('@storybook/sveltekit'),
};

export default config;
