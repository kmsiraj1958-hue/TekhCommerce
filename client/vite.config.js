import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 5200,
    strictPort: true,
    host: true,
    allowedHosts: true,
    fs: { allow: [path.resolve(__dirname, '../../..')] },
    proxy: {
      '/api': 'http://127.0.0.1:5010',
      '/static': 'http://127.0.0.1:5010',
    },
  },
});
