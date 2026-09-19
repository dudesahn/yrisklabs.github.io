import {
  draftKey, intakeFields, invalidFields, parseDraft,
  serializeDraft, exportMarkdown, intakeFilename, intakeExportDate,
} from "../lib/asset-intake.mjs";
import { intakeNetwork } from "../lib/token-lookup.mjs";
import { setupAssetLookup } from "./asset-lookup";
type IntakeControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing intake element: ${id}`);
  return found as T;
}

const form = element<HTMLFormElement>("intake-form");
const draftStatus = element("draft-status");
const saveStatus = element("save-status");
const exportStatus = element("export-status");
const copyButton = element<HTMLButtonElement>("copy-responses");
const errorSummary = element("intake-errors");
const errorList = element("intake-error-list");
const controls = new Map(intakeFields.map(({ id }) => [id, element<IntakeControl>(id)]));
const printDocument = document.querySelector<HTMLElement>(".intake-print")!;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let validationStarted = false;
let lastMissing = "";

function setStatus(target: HTMLElement, message: string, tone = "neutral") {
  if (target.textContent !== message) target.textContent = message;
  target.dataset.tone = tone;
}

function draftError(message = "", tone = "error") {
  setStatus(draftStatus, message, tone);
  draftStatus.hidden = !message;
  if (message) setStatus(saveStatus, "");
}

function values(): Record<string, string> {
  return Object.fromEntries([...controls].map(([id, control]) => [id, control.value]));
}

function resize(control: IntakeControl) {
  if (control instanceof HTMLTextAreaElement) {
    control.style.height = "auto";
    const border = control.offsetHeight - control.clientHeight;
    control.style.height = `${control.scrollHeight + border}px`;
  }
}

function saveDraft() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  // Best-effort autosave: the most recent edit wins, with no tab coordination.
  try {
    localStorage.setItem(draftKey, serializeDraft(values()));
    dirty = false;
    draftError();
    setStatus(saveStatus, "✓ Saved locally", "success");
  } catch {
    draftError("Couldn't save. Keep this page open and copy or download your answers.");
  }
}

function showErrors() {
  const current = values();
  const missing = invalidFields(current);
  const ids = new Set(missing.map(({ id }) => id));
  element("email-error").textContent = current.email.trim() ? "Enter a valid email." : "Enter email or Telegram.";
  if (ids.has("asset-name") || ids.has("asset-symbol")) revealAssetDetails();
  for (const [id, control] of controls) {
    if (ids.has(id)) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
    element(`${id}-error`).hidden = !ids.has(id);
  }
  const emailLabel = current.email.trim() ? "Email" : "Email or Telegram";
  const signature = missing.map(({ id }) => id === "email" ? emailLabel : id).join(",");
  if (signature !== lastMissing) {
    errorList.replaceChildren(...missing.map(({ id, label }) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = id === "email" ? emailLabel : label;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        controls.get(id)!.focus();
      });
      item.append(link);
      return item;
    }));
    lastMissing = signature;
  }
  errorSummary.hidden = !missing.length;
  return missing.length === 0;
}

function validateForExport() {
  validationStarted = true;
  saveDraft();
  if (showErrors()) { setStatus(exportStatus, ""); return true; }
  setStatus(exportStatus, "Check the highlighted fields.", "error");
  errorSummary.focus();
  return false;
}

function syncPrint() {
  const current = values();
  element("print-export-date").textContent = intakeExportDate();
  printDocument.dataset.complete = String(invalidFields(current).length === 0);
  printDocument.querySelectorAll<HTMLElement>("[data-print-value]").forEach((target) => {
    const answer = current[target.dataset.printValue!] ?? "";
    if (target.classList.contains("intake-print-answer")) {
      // Keep ordinary paragraphs together at page breaks. Very long paragraphs
      // can still span pages; all user content is inserted as literal text.
      target.replaceChildren(...answer.split(/(\n{2,})/).map((part, index) => {
        if (index % 2) return document.createTextNode(part);
        const paragraph = document.createElement("p");
        paragraph.textContent = part;
        return paragraph;
      }));
    } else {
      target.textContent = answer;
      target.parentElement!.hidden = !answer.trim();
    }
  });
}

function restoreValues(saved: string) {
  // Parse the entire draft before touching any answers.
  const restored = parseDraft(saved);
  for (const [id, control] of controls) {
    let value = restored[id] ?? "";
    if (control instanceof HTMLSelectElement) {
      value = intakeNetwork(value)?.name ?? value;
      // Preserve older drafts, including networks outside the lookup list.
      if (![...control.options].some((option) => option.value === value)) {
        control.add(new Option(value || "Select a network", value));
      }
    }
    control.value = value;
    resize(control);
  }
}

try {
  const saved = localStorage.getItem(draftKey);
  if (saved) {
    try {
      restoreValues(saved);
      setStatus(saveStatus, "Draft restored");
    } catch {
      draftError("The saved draft could not be restored. New edits will replace it.", "warning");
    }
  }
} catch {
  draftError("Browser storage is unavailable. Keep this page open until you copy or download your answers.");
}

function markDirty() {
  dirty = true;
  setStatus(exportStatus, "");
  if (validationStarted) showErrors();
  setStatus(saveStatus, "");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}

for (const control of controls.values()) {
  resize(control);
  control.addEventListener("input", () => {
    resize(control);
    markDirty();
  });
  // Also captures browser autofill and saves when leaving a field.
  control.addEventListener("change", () => { resize(control); markDirty(); saveDraft(); });
}

const revealAssetDetails = setupAssetLookup({
  chain: element<HTMLSelectElement>("chain"),
  address: element<HTMLInputElement>("contract-address"),
  name: element<HTMLInputElement>("asset-name"),
  symbol: element<HTMLInputElement>("asset-symbol"),
  onUpdate: markDirty,
});

element<HTMLButtonElement>("download-markdown").addEventListener("click", () => {
  if (!validateForExport()) return;
  const current = values();
  const exportedAt = new Date();
  const file = new Blob([exportMarkdown(current, exportedAt)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = intakeFilename(current["asset-name"], exportedAt);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

copyButton.addEventListener("click", async () => {
  if (!validateForExport()) return;
  copyButton.disabled = true;
  try {
    await navigator.clipboard.writeText(exportMarkdown(values()));
    setStatus(exportStatus, "✓ Copied", "success");
  } catch {
    setStatus(exportStatus, "Couldn't copy. Download Markdown instead.", "error");
  } finally {
    copyButton.disabled = false;
  }
});

element<HTMLButtonElement>("print-intake").addEventListener("click", () => {
  if (!validateForExport()) return;
  syncPrint();
  window.print();
});

// Native print shortcuts also use the complete text layout. Incomplete forms
// print a completion message, not an apparently finished intake.
window.addEventListener("beforeprint", () => {
  saveDraft();
  syncPrint();
  printDocument.removeAttribute("aria-hidden");
});
window.addEventListener("afterprint", () => printDocument.setAttribute("aria-hidden", "true"));
window.addEventListener("pagehide", saveDraft);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveDraft();
});
let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => controls.forEach(resize));
});
form.addEventListener("submit", (event) => event.preventDefault());
for (const id of ["download-markdown", "copy-responses", "print-intake"]) {
  element<HTMLButtonElement>(id).disabled = false;
}
