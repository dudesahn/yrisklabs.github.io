import { test, expect, intakeNetworks, draftKey, addressA, addressB, logoA, logoB, abiString, gate, completeValues, seedDraft, openForm, downloadedText } from "./fixtures.mjs";

for (const chain of intakeNetworks) {
  test(`${chain.name}: explorer paste selects the chain, fills details, and normalizes repeated pastes`, async ({ page, network }) => {
    await openForm(page);
    await page.locator("#contract-address").fill(`https://${chain.explorer}/token/${addressA}?source=review#code`);
    await expect(page.locator("#chain")).toHaveValue(chain.name);
    await expect(page.locator("#contract-address")).toHaveValue(addressA);
    await expect(page.locator("#asset-name")).toHaveValue(`Example ${chain.name}`);
    await expect(page.locator("#asset-symbol")).toHaveValue(`T${chain.id}`);
    await expect(page.locator("#token-logo")).toBeVisible();
    await expect(page.locator("#token-explorer")).toHaveAttribute("href", `https://${chain.explorer}/token/${addressA}`);
    const count = network.requests.length;
    await page.clock.install();
    await page.locator("#contract-address").fill(`https://${chain.explorer}/address/${addressA}`);
    await expect(page.locator("#contract-address")).toHaveValue(addressA);
    await page.clock.runFor(600);
    expect(network.requests).toHaveLength(count);
  });
}

test("switching chains at the same address refreshes metadata and caches each logo list", async ({ page, network }) => {
  await openForm(page);
  await page.locator("#contract-address").fill(addressA);
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
  await page.locator("#chain").selectOption("Arbitrum");
  await expect(page.locator("#asset-name")).toHaveValue("Example Arbitrum");
  await page.locator("#chain").selectOption("Ethereum");
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
  expect(network.requests.filter(({ url }) => url.startsWith("https://tokens.coingecko.com/"))).toHaveLength(2);
});

test("pasting a new address replaces restored token details and saves the replacement", async ({ page, network }) => {
  const pending = gate();
  const normalRpc = network.rpc;
  network.rpc = async (args) => {
    if (args.data.params[0].to === addressB) await pending.promise;
    return normalRpc(args);
  };
  await seedDraft(page, completeValues({ "contract-address": addressA, "asset-name": "Old saved name", "asset-symbol": "OLD", backing: "Keep this narrative", contact: "Keep this contact" }));
  await openForm(page);
  await expect(page.locator("#token-lookup-status")).toContainText("Token details found");
  await expect(page.locator("#asset-name")).toHaveValue("Old saved name");
  await page.locator("#contract-address").fill(addressB);
  await expect(page.locator("#asset-name")).toHaveValue("");
  await expect(page.locator("#asset-symbol")).toHaveValue("");
  pending.release();
  await expect(page.locator("#asset-name")).toHaveValue("Second Ethereum");
  await expect(page.locator("#asset-symbol")).toHaveValue("S1");
  await expect(page.locator("#apply-token-details")).toBeHidden();
  await expect(page.locator("#backing")).toHaveValue("Keep this narrative");
  await expect(page.locator("#contact")).toHaveValue("Keep this contact");
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).values["asset-symbol"], draftKey)).toBe("S1");
  await page.reload();
  await expect(page.locator("#asset-name")).toHaveValue("Second Ethereum");
  await expect(page.locator("#asset-symbol")).toHaveValue("S1");
});

test("a new token replaces previous manual edits, and a chain change refreshes restored metadata", async ({ page }) => {
  await seedDraft(page, completeValues({ "contract-address": addressA }));
  await openForm(page);
  await page.locator("#chain").selectOption("Arbitrum");
  await expect(page.locator("#asset-name")).toHaveValue("Example Arbitrum");
  await expect(page.locator("#asset-symbol")).toHaveValue("T42161");
  await page.locator("#asset-name").fill("Previous custom name");
  await page.locator("#asset-symbol").fill("PREVIOUS");
  await page.locator("#contract-address").fill(`https://fraxscan.com/token/${addressB}`);
  await expect(page.locator("#asset-name")).toHaveValue("Second Fraxtal");
  await expect(page.locator("#asset-symbol")).toHaveValue("S252");
});

test("a failed lookup for a new address cannot export the previous token's metadata", async ({ page, network }) => {
  const normalRpc = network.rpc;
  network.rpc = async (args) => args.data.params[0].to === addressB ? { status: 503, body: "Unavailable" } : normalRpc(args);
  await seedDraft(page, completeValues({ "contract-address": addressA }));
  await openForm(page);
  await page.locator("#contract-address").fill(addressB);
  await expect(page.locator("#token-lookup-status")).toContainText("could not be loaded");
  await expect(page.locator("#asset-name")).toHaveValue("");
  await expect(page.locator("#asset-symbol")).toHaveValue("");
  await page.locator("#download-markdown").click();
  await expect(page.locator("#intake-errors")).toBeVisible();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(2);
});

test("manual N/A address entry preserves manually entered asset details", async ({ page, network }) => {
  await openForm(page);
  await page.locator("#asset-name").fill("Manual asset");
  await page.locator("#asset-symbol").fill("MAN");
  await page.locator("#contract-address").fill("N/A");
  await page.locator("#chain").selectOption("Fraxtal");
  await expect(page.locator("#asset-name")).toHaveValue("Manual asset");
  await expect(page.locator("#asset-symbol")).toHaveValue("MAN");
  expect(network.requests).toEqual([]);
});

test("late RPC responses and logos cannot replace a newer asset", async ({ page, network }) => {
  const oldRpc = gate(), oldLogo = gate();
  const normalRpc = network.rpc, normalLogo = network.logo;
  const completed = [];
  // Let old requests finish despite cancellation to exercise the stale-result
  // guard itself, rather than passing only because the browser aborted them.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) => original(url, { ...options, signal: undefined });
  });
  network.rpc = async (args) => {
    if (args.data.params[0].to === addressA) await oldRpc.promise;
    const result = await normalRpc(args);
    completed.push(args.data.params[0].to);
    return result;
  };
  network.logo = async (args) => {
    if (args.url === logoA) await oldLogo.promise;
    return normalLogo(args);
  };
  await openForm(page);
  await page.locator("#contract-address").fill(addressA);
  await expect.poll(() => network.requests.some(({ url }) => url === logoA)).toBe(true);
  await page.locator("#contract-address").fill(addressB);
  await expect(page.locator("#asset-name")).toHaveValue("Second Ethereum");
  await expect(page.locator("#token-logo")).toHaveAttribute("src", logoB);
  oldRpc.release(); oldLogo.release();
  await expect.poll(() => completed.filter((value) => value === addressA).length).toBe(2);
  // Allow both stale response callbacks to run, then assert current values.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#asset-name")).toHaveValue("Second Ethereum");
  await expect(page.locator("#token-logo")).toHaveAttribute("src", logoB);
  await expect(page.locator("#token-explorer")).toHaveAttribute("href", `https://etherscan.io/token/${addressB}`);
});

test("manual edits and deliberately emptied fields survive pending lookups", async ({ page, network }) => {
  const pending = gate();
  const normalRpc = network.rpc;
  network.rpc = async (args) => { await pending.promise; return normalRpc(args); };
  await openForm(page);
  await page.locator("#contract-address").fill(addressA);
  await expect.poll(() => network.requests.filter(({ body }) => body).length).toBe(2);
  await page.locator("#asset-name").fill("My reviewed name");
  await page.locator("#asset-symbol").fill("Temporary");
  await page.locator("#asset-symbol").fill("");
  pending.release();
  await expect(page.locator("#token-lookup-status")).toContainText("Token details found");
  await expect(page.locator("#asset-name")).toHaveValue("My reviewed name");
  await expect(page.locator("#asset-symbol")).toHaveValue("");
  await page.locator("#apply-token-details").click();
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
  await expect(page.locator("#asset-symbol")).toHaveValue("T1");
});

test("a failed retry preserves previously found partial metadata", async ({ page, network }) => {
  const normalRpc = network.rpc;
  network.rpc = async (args) => args.data.id === 1 ? normalRpc(args) : { json: { id: 2, error: { code: -32000 } } };
  await openForm(page);
  await page.locator("#contract-address").fill(addressA);
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
  await expect(page.locator("#retry-token-lookup")).toBeVisible();
  network.rpc = async () => ({ status: 503, body: "Unavailable" });
  await page.locator("#retry-token-lookup").click();
  await expect(page.locator("#token-lookup-status")).toContainText("could not be loaded");
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
});

test("restored manual answers survive lookups, and contact or narrative text never enters requests", async ({ page, network }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
    window.print = () => window.dispatchEvent(new Event("beforeprint"));
  });
  await seedDraft(page, completeValues({ "contract-address": addressA, backing: "PRIVATE NARRATIVE", contact: "PRIVATE CONTACT" }));
  await openForm(page);
  await expect(page.locator("#token-lookup-status")).toContainText("Token details found");
  await expect(page.locator("#asset-name")).toHaveValue("Manual Asset");
  await expect(page.locator("#asset-symbol")).toHaveValue("MAN");
  await expect(page.locator("#backing")).toHaveValue("PRIVATE NARRATIVE");
  await page.locator("#contact").fill("PRIVATE CONTACT edited");
  await page.locator("#backing").fill("PRIVATE NARRATIVE edited");
  await page.locator("#copy-responses").click();
  await expect(page.locator("#export-status")).toContainText("Responses copied");
  await page.locator("#print-intake").click();
  const download = await downloadedText(page);
  expect(download.text).toContain("PRIVATE NARRATIVE");
  expect(download.text).toContain("PRIVATE CONTACT");
  expect(JSON.stringify(network.allRequests)).not.toMatch(/PRIVATE|Manual Asset|MAN/);
});

test("lookup timeout clears the spinner and leaves manual exports available", async ({ page, network }) => {
  const pending = gate();
  network.rpc = async () => { await pending.promise; return { status: 503, body: "Unavailable" }; };
  await seedDraft(page, completeValues({ "contract-address": addressA }));
  await page.clock.install();
  await openForm(page);
  await page.clock.runFor(351);
  await expect(page.locator("#token-lookup-status")).toHaveAttribute("data-loading", "true");
  await page.clock.runFor(5001);
  await expect(page.locator("#token-lookup-status")).toContainText("could not be loaded");
  await expect(page.locator("#token-lookup-status")).toHaveAttribute("data-loading", "false");
  pending.release();
  expect((await downloadedText(page)).text).toContain("**Asset name:** Manual Asset");
});

for (const failure of ["missing", "list failure", "image failure", "untrusted host"]) {
  test(`${failure}: omit the logo without blocking token metadata`, async ({ page, network }) => {
    if (failure === "missing") network.list = async () => ({ json: { tokens: [] } });
    if (failure === "list failure") network.list = async () => ({ status: 429, body: "Rate limited" });
    if (failure === "image failure") network.logo = async () => undefined;
    if (failure === "untrusted host") network.list = async () => ({ json: { tokens: [{ chainId: 1, address: addressA, logoURI: "https://example.invalid/tracker" }] } });
    await openForm(page);
    await page.locator("#contract-address").fill(addressA);
    await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#token-logo")).toBeHidden();
    await expect(page.locator("#retry-token-lookup")).toBeHidden();
  });
}

test("clearing an address drops old metadata and a change-only explorer paste triggers lookup", async ({ page }) => {
  await openForm(page);
  await page.locator("#contract-address").fill(addressA);
  await expect(page.locator("#asset-name")).toHaveValue("Example Ethereum");
  await page.locator("#asset-symbol").fill("MY SYMBOL");
  await page.locator("#contract-address").fill("");
  await expect(page.locator("#asset-name")).toHaveValue("");
  await expect(page.locator("#asset-symbol")).toHaveValue("");
  await expect(page.locator("#token-summary")).toBeHidden();
  await page.locator("#contract-address").evaluate((control, address) => {
    control.value = `https://fraxscan.com/token/${address}`;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, addressB);
  await expect(page.locator("#chain")).toHaveValue("Fraxtal");
  await expect(page.locator("#asset-name")).toHaveValue("Second Fraxtal");
  await expect(page.locator("#asset-symbol")).toHaveValue("S252");
});

test("untrusted token text stays literal in the page and export", async ({ page, network }) => {
  const text = '<img src=x onerror="window.injected=true">';
  network.rpc = async ({ data }) => ({ json: { id: data.id, result: abiString(text) } });
  await seedDraft(page, completeValues({ "asset-name": "", "asset-symbol": "", "contract-address": addressA }));
  await openForm(page);
  await expect(page.locator("#asset-name")).toHaveValue(text);
  await expect(page.locator("#token-summary-title img")).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect((await downloadedText(page)).text).toContain('\\<img src=x onerror="window.injected=true"\\>');
});
