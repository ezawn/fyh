import { defineConfig } from "vite";

// The web app runs on :5173 and forwards /api to the Express server on :3001.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
