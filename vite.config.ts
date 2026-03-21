import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      polyfillModulePreload: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // ✅ FIX: stop Vite from scanning uploaded sites CSS/SVG files
      watch: {
        ignored: ['**/uploads/**', '**/uploads/sites/**'],
      },
    },
    // ✅ FIX: stop Vite css analysis from touching uploaded site files
    css: {
      devSourcemap: false,
    },
    optimizeDeps: {
      exclude: [],
    },
  };
});