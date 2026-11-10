import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const DEV_CONTACT_EMAIL = "hello@example.com";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const contactEmail = env.VITE_CONTACT_EMAIL;
  const isProductionBuild = command === "build" && mode !== "test";

  // Fail fast: a production bundle without a valid contact address would ship a broken footer.
  if (isProductionBuild && !contactEmail) {
    throw new Error(
      "VITE_CONTACT_EMAIL is required for a production build (see apps/web/.env.example).",
    );
  }
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    throw new Error("VITE_CONTACT_EMAIL must be an email address like hello@example.com.");
  }

  return {
    plugins: [react()],
    define: contactEmail
      ? undefined
      : { "import.meta.env.VITE_CONTACT_EMAIL": JSON.stringify(DEV_CONTACT_EMAIL) },
    server: {
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://localhost:3000",
          changeOrigin: false,
          xfwd: false,
        },
      },
    },
    build: {
      // Keep every asset a separate file: the CSP (SR-019) forbids inline data for scripts and styles.
      assetsInlineLimit: 0,
      sourcemap: false,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // Dates must not shift for clients west of UTC (UX-014), so tests run there.
      env: { TZ: "America/New_York", VITE_CONTACT_EMAIL: DEV_CONTACT_EMAIL },
      restoreMocks: true,
      testTimeout: 15000,
    },
  };
});
