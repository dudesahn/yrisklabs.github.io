import { preview } from "astro";

// Keep the test server attached to Playwright even in environments where the
// Astro CLI automatically starts a background process.
const server = await preview({ server: { host: "127.0.0.1", port: 4322 }, logLevel: "error" });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}
