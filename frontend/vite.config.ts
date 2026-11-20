import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Works seamlessly on both local dev/preview ('/') and GitHub Pages ('/us-economy-atlas/')
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          geo: ["topojson-client", "us-atlas/states-10m.json", "us-atlas/counties-10m.json"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
