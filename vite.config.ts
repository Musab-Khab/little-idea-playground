import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: { port: 3000, strictPort: true },
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"] },
  ssr: {
    // Server-only packages stay external to the SSR bundle.
    external: ["postgres", "drizzle-orm", "otpauth", "qrcode"],
  },
  plugins: [
    tsConfigPaths(),
    // src/server.ts wraps the TanStack server entry with SSR error handling.
    tanstackStart({ server: { entry: "server" } }),
    nitro({ preset: "node-server" }),
    viteReact(),
    tailwindcss(),
  ],
});
