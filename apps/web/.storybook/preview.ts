import type { Preview } from '@storybook/sveltekit';

import '../src/app.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'canvas',
      values: [{ name: 'canvas', value: '#ffffff' }],
    },
    viewport: {
      // Primer breakpoints from DESIGN.md
      viewports: {
        narrow: { name: 'Narrow (520)', styles: { width: '520px', height: '900px' } },
        client: { name: 'Client detail (900)', styles: { width: '900px', height: '900px' } },
        sidebar: { name: 'Sidebar collapse (860)', styles: { width: '860px', height: '900px' } },
        wide: { name: 'Main column (1060)', styles: { width: '1060px', height: '900px' } },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    sveltekit_experimental: {
      // Storybook is static — nav clicks log instead of navigating
      hrefs: 'log',
    },
  },
};

export default preview;
