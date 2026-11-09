import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = process.env.PORT || env.PORT || '8080';
  return {
    plugins: [react()],
    server: { port: 5183, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  };
});
