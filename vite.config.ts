import { defineConfig, type Plugin } from 'vite';
import { config } from './src/config.ts';
import { copy } from './src/copy.ts';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// index.html takes its title, description and theme storage key from copy.ts/config.ts,
// so the no-flash script can't drift from the app.
function htmlPlaceholders(): Plugin {
  const values: Record<string, string> = {
    __APP_TITLE__: escapeHtml(copy.title),
    __APP_DESCRIPTION__: escapeHtml(copy.start.tagline),
    __THEME_KEY__: JSON.stringify(config.storageKeys.theme),
  };
  return {
    name: 'followone:html-placeholders',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/__[A-Z_]+__/g, (token) => {
          const value = values[token];
          if (value === undefined) throw new Error(`index.html: unknown placeholder ${token}`);
          return value;
        }),
    },
  };
}

// Browsers refuse module scripts and CORS-mode stylesheets on file:// pages. Shipping the
// bundle as an IIFE in a deferred classic script, without crossorigin, lets dist/index.html
// open straight from disk. (cssCodeSplit: false below keeps the CSS a render-blocking <link>;
// with IIFE output Vite would otherwise inject it from JS, after the first paint.) Only tags for
// our own ./ assets lose crossorigin; the font host's preconnect needs it.
function fileProtocolSafe(): Plugin {
  return {
    name: 'followone:file-protocol-safe',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<script type="module" crossorigin/g, '<script defer')
          .replace(/ crossorigin(?=[^>]* (?:src|href)="\.\/)/g, ''),
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [htmlPlaceholders(), fileProtocolSafe()],
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { output: { format: 'iife' } },
  },
});
