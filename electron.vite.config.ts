import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    // Bake the self-hosted Umami telemetry target into the packaged main bundle.
    // The CI release build sets HIBIT_UMAMI_HOST / HIBIT_UMAMI_WEBSITE_ID;
    // when unset these resolve to "" so telemetry stays a no-op.
    define: {
      "process.env.HIBIT_BUILD_UMAMI_HOST": JSON.stringify(process.env.HIBIT_UMAMI_HOST || ""),
      "process.env.HIBIT_BUILD_UMAMI_WEBSITE_ID": JSON.stringify(
        process.env.HIBIT_UMAMI_WEBSITE_ID || "",
      ),
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    // Pinned dev port so hi-bit doesn't collide with sibling electron-vite apps
    // (baby-menu 5273, short-pipe 5373, openbud 5473). strictPort fails loudly
    // instead of silently loading the wrong app's renderer.
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: "out/renderer",
      // Keep the audio capture worklet a real emitted file rather than an inlined
      // data: URL: audioWorklet.addModule() must load it from 'self', and a
      // data: URL is blocked by the renderer's script-src CSP in packaged builds.
      assetsInlineLimit: (filePath: string) =>
        filePath.includes("captureWorklet") ? false : undefined,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@design": resolve(__dirname, "design"),
      },
    },
    plugins: [react()],
  },
});
