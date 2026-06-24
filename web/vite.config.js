import { defineConfig } from 'vite'

// Static, dependency-free (at runtime) build of the smartervote app.
// Everything ships as plain static assets so it can be hosted anywhere.
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // keep it simple & debuggable
    sourcemap: true,
  },
})
