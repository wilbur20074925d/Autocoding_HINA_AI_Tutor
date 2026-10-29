import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  return {
    envDir: path.resolve(__dirname, '..'),
    plugins: [react(), crx({ manifest })],
    resolve: {
      alias: {
        '@hina': path.resolve(__dirname, '../src'),
        'plotly.js/dist/plotly': path.resolve(__dirname, 'node_modules/plotly.js-dist-min/plotly.min.js'),
        'plotly.js/dist/plotly.js': path.resolve(__dirname, 'node_modules/plotly.js-dist-min/plotly.min.js'),
        'plotly.js': path.resolve(__dirname, 'node_modules/plotly.js-dist-min/plotly.min.js'),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
      'import.meta.env.VITE_HINA_LABEL_EDGE': JSON.stringify(
        env.VITE_HINA_LABEL_EDGE === 'true' || env.VITE_HINA_LABEL_EDGE === '1' ? 'true' : 'true'
      ),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_ZENMUX_API_KEY': JSON.stringify(env.VITE_ZENMUX_API_KEY ?? ''),
    },
    optimizeDeps: {
      include: ['react-plotly.js', 'plotly.js-dist-min'],
    },
    build: {
      sourcemap: true,
      modulePreload: false,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            const norm = id.replace(/\\/g, '/');
            // Shared by SW + content scripts — must never import page-assist (uses window at load time).
            if (
              norm.includes('/extension/src/shared/debugLog') ||
              norm.includes('/extension/src/shared/tutorMessages') ||
              norm.includes('/extension/src/shared/viewportRect') ||
              norm.includes('/extension/src/shared/webTabPatterns') ||
              norm.includes('/extension/src/lib/shortcutBindings') ||
              norm.includes('/extension/src/lib/extensionCommands')
            ) {
              return 'extension-shared';
            }
            if (norm.includes('/extension/src/content/pageAssist/')) {
              return 'page-assist-core';
            }
            if (norm.includes('/extension/src/background') || norm.includes('supabaseWorker')) {
              return 'background-core';
            }
            return undefined;
          },
        },
      },
    },
  };
});
