import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://yrisklabs.com",
  image: { service: { entrypoint: "./src/lib/chart-image-service.mjs" } },
  redirects: {
    "/posts": "/research",
    "/posts/[id]": "/research/[id]",
  },
  integrations: [
    sitemap({
      filter: (page) => !["/lr-handoff", "/asset-intake"].some((path) =>
        new URL(page).pathname.startsWith(path)),
    }),
  ],
});
