import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const kimiApiKey = env.VITE_KIMI_API_KEY || env.KIMI_API_KEY || '';
  const kimiLabelModel =
    env.VITE_KIMI_LABEL_MODEL ||
    env.VITE_KIMI_MODEL ||
    env.KIMI_MODEL ||
    env.KIMI_LABEL_MODEL ||
    '';

  return {
  plugins: [react()],
  define: {
    'import.meta.env.VITE_KIMI_API_KEY': JSON.stringify(kimiApiKey),
    'import.meta.env.VITE_KIMI_LABEL_MODEL': JSON.stringify(kimiLabelModel),
  },
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
};
});
