import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" },
  },
  build: {
    target: "es2022",
    license: { fileName: "dependency-licenses.md" },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "three",
              test: /node_modules\/three\//,
              priority: 20,
              maxSize: 350_000,
            },
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 20,
              maxSize: 350_000,
            },
          ],
        },
      },
    },
  },
});
