import { test, expect, intakeFields, draftKey, completeValues, seedDraft, openForm, downloadedText } from "./fixtures.mjs";
import { exportMarkdown } from "../../src/lib/asset-intake.mjs";

for (const action of ["download-markdown", "copy-responses", "print-intake"]) {
  test(`${action} rejects empty and whitespace-only answers and focuses the error summary`, async ({ page, network }) => {
    await seedDraft(page, completeValues({ backing: " \n\t ", contact: "" }));
    await page.addInitScript(() => { window.print = () => { throw new Error("Printing must be blocked"); }; });
    await openForm(page);
    await page.locator(`#${action}`).click();
    await expect(page.locator("#intake-errors")).toBeFocused();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(2);
    await page.locator('#intake-error-list a[href="#backing"]').click();
    await expect(page.locator("#backing")).toBeFocused();
    await page.locator("#backing").fill("No");
    await page.locator("#contact").fill("N/A");
    await expect(page.locator("#intake-errors")).toBeHidden();
    expect(network.requests).toEqual([]);
  });
}

test("autosave debounces typing, flushes on page hiding, and restores the last edit", async ({ page }) => {
  await page.clock.install();
  await openForm(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.saveFeedback = [];
    Storage.prototype.setItem = function (key, value) {
      window.saveFeedback.push(document.querySelector("#backing-save-status").textContent);
      return original.call(this, key, value);
    };
  });
  await page.locator("#backing").fill("First edit");
  await page.clock.runFor(400);
  await expect(page.locator("#backing-save-status")).toBeEmpty();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  await page.locator("#backing").fill("Latest edit — 日本語");
  await page.clock.runFor(400);
  await expect(page.locator("#backing-save-status")).toBeEmpty();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  expect(await page.evaluate(() => window.saveFeedback)).toEqual([]);
  await page.clock.runFor(101);
  expect(await page.evaluate(() => window.saveFeedback)).toEqual(["Saving…"]);
  await expect(page.locator("#backing-save-status")).toHaveText("Saved in this browser.");
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.locator("#backing").fill("Final edit before leaving");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values.backing).toBe("Final edit before leaving");
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Final edit before leaving");
  await expect(page.locator("#draft-status")).toBeHidden();
  await expect(page.locator("#backing-save-status")).toBeEmpty();
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
  await expect(page.locator("#backing-save-status")).toHaveText("Saved in this browser.");
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.reload();
  await expect(page.locator("#backing")).toHaveValue("Recovered answer");
});

test("question save feedback is local, temporary, and cleared on leaving the box", async ({ page }) => {
  await page.clock.install();
  await openForm(page);
  const answer = page.locator("#backing");
  const status = page.locator("#backing-save-status");
  await answer.focus();
  await expect(status).toBeEmpty();
  await answer.fill("An answer");
  await expect(status).toBeEmpty();
  const before = await status.boundingBox();
  const box = await answer.boundingBox();
  expect(before.y).toBeGreaterThanOrEqual(box.y + box.height);
  expect(Math.abs(before.x + before.width - box.x - box.width)).toBeLessThan(1);
  expect(await status.evaluate((node) => getComputedStyle(node).textAlign)).toBe("right");
  await page.clock.runFor(501);
  await expect(status).toHaveText("Saved in this browser.");
  await page.clock.runFor(1500);
  await answer.fill("Another edit");
  await expect(status).toBeEmpty();
  await page.clock.runFor(501);
  await expect(status).toHaveText("Saved in this browser.");
  await page.clock.runFor(2001);
  await expect(status).toBeEmpty();
  const after = await status.boundingBox();
  expect(after.height).toBe(before.height); // Feedback must not shift the form.
  await answer.fill("Move to the next question while saving");
  await page.locator("#liquidity").focus();
  await expect(status).toBeEmpty();
  await expect(page.locator("#liquidity-save-status")).toBeEmpty();
  await page.clock.runFor(600);
  await expect(status).toBeEmpty();
  await answer.focus();
  await expect(status).toBeEmpty(); // Refocusing does not replay an old save.
  await answer.fill("Saved before leaving");
  await page.clock.runFor(501);
  await expect(status).toHaveText("Saved in this browser.");
  await page.locator("#liquidity").focus();
  await expect(status).toBeEmpty();
  await page.locator("#liquidity").fill("New question");
  await expect(page.locator("#liquidity-save-status")).toBeEmpty();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(600);
  await expect(page.locator("#liquidity-save-status")).toBeEmpty();
});

test("detail edits and restored drafts autosave silently even with a question focused", async ({ page }) => {
  await seedDraft(page, completeValues());
  await page.clock.install();
  await openForm(page);
  await expect(page.locator("#draft-status")).toBeHidden();
  await page.locator("#asset-name").fill("Updated asset");
  await page.clock.runFor(501);
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), draftKey)).values["asset-name"]).toBe("Updated asset");
  await page.locator("#backing").focus();
  await page.locator("#contact").evaluate((control) => {
    control.value = "Autofilled contact";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.clock.runFor(501);
  for (const status of await page.locator(".intake-question-save-status").all()) await expect(status).toBeEmpty();
  await expect(page.locator("#draft-status")).toBeHidden();
});

test("failed saves never show success, errors survive blur, and a later save clears the error", async ({ page }) => {
  await page.clock.install();
  await openForm(page);
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await page.locator("#backing").fill("Unsaved work");
  await expect(page.locator("#backing-save-status")).toBeEmpty();
  await page.clock.runFor(501);
  await expect(page.locator("#backing-save-status")).toBeEmpty();
  await expect(page.locator("#draft-status")).toBeVisible();
  await expect(page.locator("#draft-status")).toContainText("could not save");
  await page.locator("#liquidity").focus();
  await page.clock.runFor(2500);
  await expect(page.locator("#draft-status")).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.locator("#liquidity").fill("Storage recovered");
  await page.clock.runFor(501);
  await expect(page.locator("#liquidity-save-status")).toHaveText("Saved in this browser.");
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
    for (const [id, value] of Object.entries(completeValues())) {
      if (id === "chain") await page.locator(`#${id}`).selectOption(value);
      else await page.locator(`#${id}`).fill(value);
    }
    await page.locator("#backing").fill("Work survives in the open form");
    await expect(page.locator("#draft-status")).toContainText("could not save");
    const download = await downloadedText(page);
    expect(download.text).toContain("Work survives in the open form");
  });
}

test("copy and download use identical complete Markdown and dated filenames", async ({ page, network }) => {
  const longAnswer = "Réserves 日本語\n\n- A detail\n- Another detail\n\n" + "Long paragraph. ".repeat(3000) + "END OF ANSWER";
  const values = completeValues({ "asset-name": "Test Asset", backing: longAnswer });
  await seedDraft(page, values);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await openForm(page);
  await page.locator("#copy-responses").click();
  await expect(page.locator("#export-status")).toContainText("Responses copied");
  const copied = await page.evaluate(() => window.copied);
  const date = copied.match(/Exported \(UTC\): (\d{4}-\d{2}-\d{2})/)[1];
  expect(copied).toBe(exportMarkdown(values, new Date(`${date}T00:00:00Z`)));
  const download = await downloadedText(page);
  expect(download.text).toBe(copied);
  expect(download.filename).toBe(`yrisk-asset-intake-test-asset-${date}.md`);
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
    await expect(page.locator("#export-status")).toContainText("Please download them instead");
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
  await seedDraft(page, completeValues({ contact: "" }));
  await openForm(page);
  await page.locator("#download-markdown").click();
  await page.locator("#contact").evaluate((control) => {
    control.value = "Autofilled contact";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#intake-errors")).toBeHidden();
  await expect(page.locator("#contact")).not.toHaveAttribute("aria-invalid", "true");
  await page.reload();
  await expect(page.locator("#contact")).toHaveValue("Autofilled contact");
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
