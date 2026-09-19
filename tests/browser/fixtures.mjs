import { test as base, expect } from "@playwright/test";
import { intakeFields, draftKey, serializeDraft } from "../../src/lib/asset-intake.mjs";
import { intakeNetworks } from "../../src/lib/token-lookup.mjs";
import { readFileSync } from "node:fs";

const intakeHtml = readFileSync(new URL("../../dist/asset-intake/index.html", import.meta.url), "utf8");
const localPaths = new Set(["/asset-intake/", "/favicon.svg",
  ...[...intakeHtml.matchAll(/(?:src|href)="(\/_astro\/[^"?#]+)"/g)].map((match) => match[1]),
]);

export { expect, intakeNetworks, intakeFields, draftKey };
export const addressA = "0x" + "1".repeat(40);
export const addressB = "0x" + "2".repeat(40);
export const logoA = "https://assets.coingecko.com/coins/images/1/thumb/a.svg";
export const logoB = "https://assets.coingecko.com/coins/images/2/thumb/b.svg";
export const word = (n) => BigInt(n).toString(16).padStart(64, "0");
export function abiString(value) {
  const bytes = Buffer.from(value);
  return "0x" + word(32) + word(bytes.length) + bytes.toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64, "0");
}
export function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}
export const completeValues = (overrides = {}) => ({
  ...Object.fromEntries(intakeFields.map(({ id }) => [id, "N/A"])),
  chain: "Ethereum", "asset-name": "Manual Asset", "asset-symbol": "MAN", ...overrides,
});

export async function seedDraft(page, values) {
  await page.addInitScript(({ key, raw }) => {
    // Seed once, so reload tests exercise the application's saved data.
    if (!sessionStorage.getItem("test-draft-seeded")) {
      localStorage.setItem(key, raw);
      sessionStorage.setItem("test-draft-seeded", "yes");
    }
  }, { key: draftKey, raw: typeof values === "string" ? values : serializeDraft(values) });
}

export async function openForm(page, { pauseClock = false } = {}) {
  if (pauseClock) await page.clock.install({ time: new Date("2026-09-19T11:00:00Z") });
  await page.goto("/asset-intake/");
  await expect(page.locator("#download-markdown")).toBeEnabled();
  // Installing a clock still advances real time between runFor calls. Pause
  // after loading so runner latency cannot cross debounce or feedback deadlines.
  if (pauseClock) await page.clock.pauseAt(new Date("2026-09-19T12:00:00Z"));
}

export async function downloadedText(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#download-markdown").click();
  const download = await pending;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return { filename: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

export const test = base.extend({
  // No test relies on live RPC, CoinGecko, or respondent information. Unexpected
  // requests fail the test, including accidental same-origin form submissions.
  network: [async ({ context, page, baseURL }, use) => {
    const errors = [], unexpected = [], requests = [], allRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    context.on("page", (other) => other.on("pageerror", (error) => errors.push(error.message)));
    const network = {
      requests, allRequests,
      rpc: async ({ data, chain }) => ({ json: {
        jsonrpc: "2.0", id: data.id,
        result: abiString(data.id === 1 ? `${data.params[0].to === addressB ? "Second" : "Example"} ${chain.name}` : `${data.params[0].to === addressB ? "S" : "T"}${chain.id}`),
      } }),
      list: async ({ chain }) => ({ json: { tokens: [
        { chainId: chain.id, address: addressA, logoURI: logoA },
        { chainId: chain.id, address: addressB, logoURI: logoB },
      ] } }),
      logo: async () => ({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="black"/></svg>' }),
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const entry = { url: url.href, method: request.method(), body: request.postData(), headers: await request.allHeaders() };
      allRequests.push(entry);
      if (url.origin === baseURL) {
        if (entry.method === "GET" && !url.search && localPaths.has(url.pathname) &&
            ["document", "script", "stylesheet", "image"].includes(request.resourceType())) return route.continue();
        unexpected.push(entry);
        return route.abort();
      }
      const chain = intakeNetworks.find((item) => new URL(item.rpc).host === url.host);
      let response;
      requests.push(entry);
      if (chain) response = await network.rpc({ data: request.postDataJSON(), chain, request });
      else if (url.host === "tokens.coingecko.com") {
        const listChain = intakeNetworks.find((item) => url.pathname === `/${item.platform}/all.json`);
        if (listChain) response = await network.list({ chain: listChain, request });
        else unexpected.push(url.href);
      } else if (["assets.coingecko.com", "coin-images.coingecko.com"].includes(url.host)) {
        response = await network.logo({ url: url.href, request });
      } else unexpected.push(url.href);
      // Aborted requests are expected when changing assets or simulating timeouts.
      try {
        if (response) await route.fulfill(response);
        else await route.abort();
      } catch (error) {
        if (!page.isClosed() && !/closed|disposed|Invalid InterceptionId/i.test(String(error))) throw error;
      }
    });
    await use(network);
    expect(unexpected, "Only expected static files and documented lookup services may receive requests").toEqual([]);
    expect(errors, "The form must not raise uncaught browser errors").toEqual([]);
  }, { auto: true }],
});
