import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appName = env.VITE_APP_NAME?.trim() || "IntQst";
  const htmlAppName = appName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return {
    base: './',
    plugins: [
      inspectAttr(),
      react(),
      {
        name: "app-title",
        transformIndexHtml: (html) => html.replace("__APP_NAME__", () => htmlAppName),
      },
    ],
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://localhost:8090',
        '/ws': { target: 'ws://localhost:8090', ws: true },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
