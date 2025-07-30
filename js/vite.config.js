import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3005,
    open: true
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      external: [],
      output: {
        format: 'es'
      }
    }
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@dfinity/agent', '@dfinity/candid', '@dfinity/identity', '@dfinity/principal', 'ethers']
  },
  // Only include the js directory files, exclude test directories
  root: '.',
  publicDir: 'public'
})
