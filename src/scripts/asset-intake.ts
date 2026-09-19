import {
  draftKey, intakeFields, missingFields, parseDraft,
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
const exportStatus = element("export-status");
const copyButton = element<HTMLButtonElement>("copy-responses");
const errorSummary = element("intake-errors");
const errorList = element("intake-error-list");
const controls = new Map(intakeFields.map(({ id }) => [id, element<IntakeControl>(id)]));
const printDocument = document.querySelector<HTMLElement>(".intake-print")!;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savedMessageTimer: ReturnType<typeof setTimeout> | undefined;
let statusQuestion: HTMLTextAreaElement | undefined;
let questionAwaitingSave = false;
let dirty = false;
let validationStarted = false;
let lastMissing = "";

function draftError(message = "") {
  if (draftStatus.textContent !== message) draftStatus.textContent = message;
  draftStatus.hidden = !message;
}

function clearQuestionStatus() {
  clearTimeout(savedMessageTimer);
  if (statusQuestion) element(`${statusQuestion.id}-save-status`).textContent = "";
  statusQuestion = undefined;
  questionAwaitingSave = false;
}

function queueQuestionStatus(control?: IntakeControl) {
  if (!(control instanceof HTMLTextAreaElement) || document.activeElement !== control) return;
  // Keep the box quiet while typing, including when a new edit follows a save.
  if (statusQuestion !== control) clearQuestionStatus();
  clearTimeout(savedMessageTimer);
  statusQuestion = control;
  questionAwaitingSave = true;
  const target = element(`${control.id}-save-status`);
  if (target.textContent) target.textContent = "";
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
  // The typing debounce has elapsed (or an explicit flush was requested).
  // Local storage writes synchronously, so success can be shown immediately.
  const questionStatus = questionAwaitingSave && statusQuestion && statusQuestion === document.activeElement
    ? element(`${statusQuestion.id}-save-status`) : undefined;
  if (questionStatus) questionStatus.textContent = "Saving…";
  try {
    localStorage.setItem(draftKey, serializeDraft(values()));
    dirty = false;
    draftError();
    if (questionStatus) {
      questionStatus.textContent = "Saved in this browser.";
      questionAwaitingSave = false;
      savedMessageTimer = setTimeout(clearQuestionStatus, 2000);
    }
  } catch {
    clearQuestionStatus();
    draftError("Your browser could not save this draft. Keep this page open until you copy or download your answers.");
  }
}

function showErrors() {
  const missing = missingFields(values());
  const ids = new Set(missing.map(({ id }) => id));
  for (const [id, control] of controls) {
    if (ids.has(id)) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
    element(`${id}-error`).hidden = !ids.has(id);
  }
  const signature = [...ids].join(",");
  if (signature !== lastMissing) {
    errorList.replaceChildren(...missing.map(({ id, label }) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = label;
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
  if (showErrors()) return true;
  exportStatus.textContent = "Complete the highlighted fields before exporting.";
  errorSummary.focus();
  return false;
}

function syncPrint() {
  const current = values();
  element("print-export-date").textContent = intakeExportDate();
  printDocument.dataset.complete = String(missingFields(current).length === 0);
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
    }
  });
}

try {
  const saved = localStorage.getItem(draftKey);
  if (saved) {
    try {
      const restored = parseDraft(saved);
      for (const [id, control] of controls) {
        let value = restored[id];
        if (control instanceof HTMLSelectElement) {
          value = intakeNetwork(value)?.name ?? value;
          // Preserve older drafts, including networks outside the lookup list.
          if (![...control.options].some((option) => option.value === value)) {
            control.add(new Option(value || "Select a network", value));
          }
        }
        control.value = value;
      }
    } catch {
      draftError("The saved draft could not be restored. New edits will replace it.");
    }
  }
} catch {
  draftError("Browser storage is unavailable. Keep this page open until you copy or download your answers.");
}

function markDirty(control?: IntakeControl) {
  dirty = true;
  queueQuestionStatus(control);
  if (validationStarted) showErrors();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}

for (const control of controls.values()) {
  resize(control);
  control.addEventListener("input", () => {
    resize(control);
    markDirty(control);
  });
  // Also captures browser autofill and saves when leaving a field.
  control.addEventListener("change", () => { resize(control); markDirty(control); saveDraft(); });
  if (control instanceof HTMLTextAreaElement) {
    control.addEventListener("blur", () => {
      if (statusQuestion === control) clearQuestionStatus();
    });
  }
}

setupAssetLookup({
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
  exportStatus.textContent = "Download started (.md). Send the file to your yRisk contact on Telegram.";
});

copyButton.addEventListener("click", async () => {
  if (!validateForExport()) return;
  copyButton.disabled = true;
  try {
    await navigator.clipboard.writeText(exportMarkdown(values()));
    exportStatus.textContent = "Responses copied. Paste them into a message to your yRisk contact on Telegram.";
  } catch {
    exportStatus.textContent = "Your browser could not copy the responses. Please download them instead.";
  } finally {
    copyButton.disabled = false;
  }
});

element<HTMLButtonElement>("print-intake").addEventListener("click", () => {
  if (!validateForExport()) return;
  syncPrint();
  window.print();
  exportStatus.textContent = "Choose Save as PDF in the print dialog, then send the file to your yRisk contact on Telegram.";
});

// Native print shortcuts also use the complete text layout. Incomplete forms
// print a completion message, not an apparently finished intake.
window.addEventListener("beforeprint", () => {
  saveDraft();
  syncPrint();
  printDocument.removeAttribute("aria-hidden");
});
window.addEventListener("afterprint", () => printDocument.setAttribute("aria-hidden", "true"));
window.addEventListener("blur", clearQuestionStatus);
window.addEventListener("pagehide", () => { clearQuestionStatus(); saveDraft(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { clearQuestionStatus(); saveDraft(); }
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
