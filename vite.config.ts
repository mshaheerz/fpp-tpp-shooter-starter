import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2100,
    rollupOptions: {
      input: {
        main: 'index.html',
        studio: 'studio/index.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes("three")) {
            return "three";
          }
          if (id.includes("@dimforge/rapier3d-compat")) {
            return "rapier";
          }
        },
        codeSplitting: true
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});