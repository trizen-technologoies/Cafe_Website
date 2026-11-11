import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths let the built site run from any host or sub-folder.
  base: './',
  server: { port: 5174, strictPort: false },
  preview: { port: 4174, strictPort: false },
});
