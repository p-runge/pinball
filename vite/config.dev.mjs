import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import "../src/env";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 8080,
  },
});
