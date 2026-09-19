import { test, expect, intakeFields, draftKey, completeValues, seedDraft, openForm, downloadedText } from "./fixtures.mjs";
import { exportMarkdown, serializeDraft } from "../../src/lib/asset-intake.mjs";

for (const action of ["download-markdown", "copy-responses", "print-intake"]) {
  test(`${action} rejects empty and whitespace-only answers and focuses the error summary`, async ({ page, network }) => {
    await seedDraft(page, completeValues({ backing: " \n\t ", telegram: "" }));
    await page.addInitScript(() => { window.print = () => { throw new Error("Printing must be blocked"); }; });
    await openForm(page);
    await page.locator(`#${action}`).click();
    await expect(page.locator("#intake-errors")).toBeFocused();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(2);
    await page.locator('#intake-error-list a[href="#backing"]').click();
    await expect(page.locator("#backing")).toBeFocused();
    await page.locator("#backing").fill("No");
    await page.locator("#telegram").fill("N/A");
    await expect(page.locator("#intake-errors")).toBeHidden();
    expect(network.requests).toEqual([]);
  });
}

test("autosave debounces typing, flushes on page hiding, and restores the last edit", async ({ page }) => {
  await openForm(page, { pauseClock: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.saveFeedback = [];
    Storage.prototype.setItem = function (key, value) {
      window.saveFeedback.push(document.querySelector("#save-status").textContent);
      return original.call(this, key, value);
    };
  });
  await page.locator("#backing").fill("First edit");
  await page.clock.runFor(400);
  await expect(page.locator("#save-status")).toBeEmpty();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  await page.locator("#backing").fill("Latest edit — 日本語");
  await page.clock.runFor(499);
  await expect(page.locator("#save-status")).toBeEmpty();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  expect(await page.evaluate(() => window.saveFeedback)).toEqual([]);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => window.saveFeedback)).toEqual([""]);
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values.backing).toBe("Latest edit — 日本語");
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(page.locator("#save-status")).toHaveAttribute("data-tone", "success");
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.locator("#backing").fill("Final edit before leaving");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values.backing).toBe("Final edit before leaving");
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Final edit before leaving");
  await expect(page.locator("#draft-status")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("Draft restored");
  await page.locator("#backing").fill("Hidden tab edit");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values.backing).toBe("Hidden tab edit");
});

test("corrupt drafts stay intact until a new edit, then saving recovers", async ({ page }) => {
  await seedDraft(page, "{broken JSON");
  await openForm(page);
  await expect(page.locator("#draft-status")).toContainText("could not be restored");
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe("{broken JSON");
  await page.locator("#backing").fill("Recovered answer");
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Recovered answer");
});

test("multiple tabs save best-effort without conflict prompts; an idle tab does not overwrite", async ({ page, context }) => {
  await seedDraft(page, completeValues({ backing: "Original answer" }));
  await openForm(page);
  const other = await context.newPage();
  await openForm(other);
  await page.locator("#backing").fill("First tab's edit");
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(other.locator("#draft-status")).toBeHidden();
  await expect(other.locator("#backing")).toHaveValue("Original answer");
  await other.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).values.backing, draftKey)).toBe("First tab's edit");
  await other.locator("#backing").fill("Second tab's later edit");
  await expect(other.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(other.locator("#draft-status")).toBeHidden();
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Second tab's later edit");
  expect((await downloadedText(page)).text).toContain("Second tab's later edit");
});

test("saving does not depend on tab coordination being available", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", {
    get() { throw new Error("Tab coordination is unavailable"); },
  }));
  await openForm(page);
  await page.locator("#backing").fill("Save without coordination");
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Save without coordination");
});

test("returning to a page saves subsequent edits", async ({ page }) => {
  await openForm(page, { pauseClock: true });
  await page.locator("#backing").fill("Before leaving");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).values.backing, draftKey)).toBe("Before leaving");
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.locator("#backing").fill("After returning");
  await page.clock.runFor(501);
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).values.backing, draftKey)).toBe("After returning");
});

test("one save status stays quiet during edits and does not shift the form", async ({ page }) => {
  await openForm(page, { pauseClock: true });
  const status = page.locator("#save-status");
  await expect(status).toHaveText("Draft saves in this browser");
  const before = await page.locator(".intake-asset").evaluate((node) => node.getBoundingClientRect().top + scrollY);
  await page.locator("#backing").fill("An answer");
  await expect(status).toBeEmpty();
  await page.clock.runFor(501);
  await expect(status).toHaveText("✓ Saved locally");
  await page.locator("#liquidity").fill("Another answer");
  await expect(status).toBeEmpty();
  await page.locator("#telegram").focus();
  await expect(status).toHaveText("✓ Saved locally");
  expect(await page.locator(".intake-asset").evaluate((node) => node.getBoundingClientRect().top + scrollY)).toBe(before);
  await expect(page.locator(".intake-question-save-status")).toHaveCount(0);
});

test("detail edits and restored drafts use the shared save status", async ({ page }) => {
  await seedDraft(page, completeValues());
  await openForm(page, { pauseClock: true });
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.locator("#asset-name").fill("Updated asset");
  await page.clock.runFor(501);
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values["asset-name"]).toBe("Updated asset");
  await page.locator("#backing").focus();
  await page.locator("#telegram").evaluate((control) => {
    control.value = "Autofilled contact";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.clock.runFor(501);
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(page.locator("#draft-status")).toBeHidden();
});

test("failed saves never show success, errors survive blur, and a later save clears the error", async ({ page }) => {
  await openForm(page, { pauseClock: true });
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await page.locator("#backing").fill("Unsaved work");
  await expect(page.locator("#save-status")).toBeEmpty();
  await page.clock.runFor(501);
  await expect(page.locator("#save-status")).toBeEmpty();
  await expect(page.locator("#draft-status")).toBeVisible();
  await expect(page.locator("#draft-status")).toContainText("Couldn't save");
  await expect(page.locator("#draft-status")).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#save-status")).toHaveAttribute("data-tone", "neutral");
  await page.locator("#liquidity").focus();
  await page.clock.runFor(2500);
  await expect(page.locator("#draft-status")).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.locator("#liquidity").fill("Storage recovered");
  await page.clock.runFor(501);
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  await expect(page.locator("#draft-status")).toBeHidden();
});

test("older draft chains and literal markup restore without execution or network requests", async ({ page, network }) => {
  const literal = '<img src="https://example.invalid/tracker" onerror="window.injected=true">\n\n<script>window.injected=true</script>';
  await seedDraft(page, completeValues({ chain: "Old manually entered chain", backing: literal }));
  await openForm(page);
  await expect(page.locator("#chain")).toHaveValue("Old manually entered chain");
  await expect(page.locator("#backing")).toHaveValue(literal);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator('[data-print-value="backing"]')).toHaveText(literal);
  await expect(page.locator('[data-print-value="backing"] img, [data-print-value="backing"] script')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect(network.requests).toEqual([]);
});

for (const failure of ["blocked", "quota"]) {
  test(`${failure} storage leaves editing and downloading usable`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "blocked") {
        Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
      } else {
        Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
      }
    }, failure);
    // Populate through the UI because storage is deliberately unavailable.
    await openForm(page);
    await page.locator("#enter-token-manually").click();
    for (const [id, value] of Object.entries(completeValues())) {
      if (id === "chain") await page.locator(`#${id}`).selectOption(value);
      else await page.locator(`#${id}`).fill(value);
    }
    await page.locator("#backing").fill("Work survives in the open form");
    await expect(page.locator("#draft-status")).toContainText("Couldn't save");
    const download = await downloadedText(page);
    expect(download.text).toContain("Work survives in the open form");
  });
}

test("copy and download use identical complete Markdown and dated filenames", async ({ page, network }) => {
  await page.clock.setFixedTime(new Date("2026-09-19T12:00:00Z"));
  const longAnswer = "Réserves 日本語\n\n- A detail\n- Another detail\n\n" + "Long paragraph. ".repeat(3000) + "END OF ANSWER";
  const values = completeValues({ "asset-name": "Test Asset", backing: longAnswer });
  await seedDraft(page, values);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await openForm(page);
  await page.locator("#copy-responses").click();
  await expect(page.locator("#export-status")).toContainText("✓ Copied");
  await expect(page.locator("#export-status")).toHaveAttribute("data-tone", "success");
  const copied = await page.evaluate(() => window.copied);
  const date = copied.match(/Exported \(UTC\): (\d{4}-\d{2}-\d{2})/)[1];
  expect(copied).toBe(exportMarkdown(values, new Date(`${date}T00:00:00Z`)));
  const download = await downloadedText(page);
  expect(download.text).toBe(copied);
  await expect(page.locator("#export-status")).toBeEmpty();
  expect(download.filename).toBe(`yrisk-asset-intake-test-asset-${date}.md`);
  expect(date).toBe("2026-09-19");
  await page.evaluate(() => { window.print = () => { window.printCalled = true; }; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  expect(await page.evaluate(() => window.printCalled)).toBe(true);
  await expect(page.locator("#export-status")).toBeEmpty();
  await expect(page.locator(".intake-actions button")).toHaveText(["Download Markdown", "Copy Markdown", "Print"]);
  expect(network.requests).toEqual([]);
});

for (const mode of ["missing", "denied"]) {
  test(`${mode} clipboard does not disable downloading or leave the copy button stuck`, async ({ page }) => {
    await seedDraft(page, completeValues());
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : {
        writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
      } });
    }, mode);
    await openForm(page);
    await page.locator("#copy-responses").click();
    await expect(page.locator("#export-status")).toContainText("Download Markdown instead");
    await expect(page.locator("#copy-responses")).toBeEnabled();
    expect((await downloadedText(page)).text).toContain("# yRisk Asset Review Intake");
  });
}

test("native printing gates incomplete forms and includes full long answers as text", async ({ page, browserName }, testInfo) => {
  await openForm(page);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".intake-print-warning")).toBeVisible();
  await expect(page.locator(".intake-print-content")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".intake-print")).toHaveAttribute("aria-hidden", "true");
  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}. ` + "Long narrative. ".repeat(25)).join("\n\n") + "\n\nFINAL PARAGRAPH";
  await page.locator("#enter-token-manually").click();
  for (const [id, value] of Object.entries(completeValues({ backing: long }))) {
    if (id === "chain") await page.locator(`#${id}`).selectOption(value);
    else await page.locator(`#${id}`).fill(value);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".intake-print-warning")).toBeHidden();
  await expect(page.locator(".intake-print-content")).toBeVisible();
  expect(await page.locator('[data-print-value="backing"]').textContent()).toBe(long);
  await expect(page.locator(".intake-print-question")).toHaveCount(7);
  if (browserName === "chromium") {
    const pdf = await page.pdf({ format: "A4", path: testInfo.outputPath("long-answers.pdf") });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }
});

test("change-only browser autofill updates validation and persists answers", async ({ page }) => {
  await seedDraft(page, completeValues({ telegram: "" }));
  await openForm(page);
  await page.locator("#download-markdown").click();
  await page.locator("#telegram").evaluate((control) => {
    control.value = "Autofilled contact";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#intake-errors")).toBeHidden();
  await expect(page.locator("#telegram")).not.toHaveAttribute("aria-invalid", "true");
  await page.reload();
  await expect(page.locator("#telegram")).toHaveValue("Autofilled contact");
});

test("narrow layouts preserve readable fields without horizontal page overflow", async ({ page }) => {
  await seedDraft(page, completeValues({ backing: "word".repeat(2000) }));
  await openForm(page);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const { id } of intakeFields) {
      const size = await page.locator(`#${id}`).evaluate((control) => parseFloat(getComputedStyle(control).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    }
    const answer = await page.locator("#backing").evaluate((control) => ({ scroll: control.scrollHeight, client: control.clientHeight }));
    expect(answer.scroll).toBeLessThanOrEqual(answer.client + 1);
  }
});

test("contact accepts either channel and keeps validation and exports consistent", async ({ page }) => {
  await seedDraft(page, completeValues({ email: "", telegram: "" }));
  await openForm(page);
  await page.getByRole("button", { name: "Download Markdown", exact: true }).click();
  await expect(page.locator("#email-error")).toHaveText("Enter email or Telegram.");
  await expect(page.locator('#intake-error-list a[href="#email"]')).toHaveText("Email or Telegram");
  await page.locator("#email").fill("invalid");
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email.");
  await expect(page.locator('#intake-error-list a[href="#email"]')).toHaveText("Email");
  await page.locator("#email").fill("team@example.org");
  await expect(page.locator("#intake-errors")).toBeHidden();
  const emailExport = (await downloadedText(page)).text;
  expect(emailExport).toContain("**Email:** team@example.org");
  expect(emailExport).not.toContain("**Telegram:**");
  await page.locator("#email").fill("");
  await page.locator("#telegram").fill("@asset_team");
  await expect(page.locator("#intake-errors")).toBeHidden();
  const telegramExport = (await downloadedText(page)).text;
  expect(telegramExport).toContain("**Telegram:** @asset\\_team");
  expect(telegramExport).not.toContain("**Email:**");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator('[data-print-value="email"]').locator("..")).toHaveAttribute("hidden", "");
  await expect(page.locator('[data-print-value="telegram"]')).toHaveText("@asset_team");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Markdown", exact: true })).toBeVisible();
});

test("a legacy contact draft restores into the new fields and saves without losing answers", async ({ page }) => {
  const { email, telegram, ...values } = completeValues({ backing: "Preserve the original answer" });
  await seedDraft(page, JSON.stringify({ version: 1, values: { ...values, contact: "team@example.org" } }));
  await openForm(page);
  await expect(page.locator("#email")).toHaveValue("team@example.org");
  await expect(page.locator("#telegram")).toHaveValue("");
  await page.locator("#telegram").fill("@asset_team");
  await expect(page.locator("#save-status")).toHaveText("✓ Saved locally");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).version, draftKey)).toBe(2);
  await page.reload();
  await expect(page.locator("#email")).toHaveValue("team@example.org");
  await expect(page.locator("#telegram")).toHaveValue("@asset_team");
  await expect(page.locator("#backing")).toHaveValue("Preserve the original answer");
});
