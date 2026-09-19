import {
  draftKey, intakeFields, missingFields, parseDraft,
  serializeDraft, exportMarkdown, intakeFilename,
} from "../lib/asset-intake.mjs";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing intake element: ${id}`);
  return found as T;
}

const form = element<HTMLFormElement>("intake-form");
const draftStatus = element("draft-status");
const exportStatus = element("export-status");
const errorSummary = element("intake-errors");
const errorList = element("intake-error-list");
const controls = new Map(intakeFields.map(({ id }) => [id, element<HTMLInputElement | HTMLTextAreaElement>(id)]));
const printDocument = document.querySelector<HTMLElement>(".intake-print")!;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let validationStarted = false;
let lastMissing = "";

function status(message = "") {
  draftStatus.hidden = !message;
  if (draftStatus.textContent !== message) draftStatus.textContent = message;
}

function values(): Record<string, string> {
  return Object.fromEntries([...controls].map(([id, control]) => [id, control.value]));
}

function resize(control: HTMLInputElement | HTMLTextAreaElement) {
  if (control instanceof HTMLTextAreaElement) {
    control.style.height = "auto";
    const border = control.offsetHeight - control.clientHeight;
    control.style.height = `${control.scrollHeight + border}px`;
  }
}

function saveDraft() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  try {
    localStorage.setItem(draftKey, serializeDraft(values()));
    dirty = false;
    status();
  } catch {
    status("Your browser could not save this draft. Keep this page open until you download your answers.");
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
      for (const [id, control] of controls) control.value = restored[id];
    } catch {
      status("The saved draft could not be restored. New edits will replace it.");
    }
  }
} catch {
  status("Browser storage is unavailable. Keep this page open until you download your answers.");
}

for (const control of controls.values()) {
  resize(control);
  control.addEventListener("input", () => {
    dirty = true;
    resize(control);
    if (validationStarted) showErrors();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  });
  // Also captures browser autofill and saves when leaving a field.
  control.addEventListener("change", () => { dirty = true; resize(control); saveDraft(); });
}

element<HTMLButtonElement>("download-markdown").addEventListener("click", () => {
  if (!validateForExport()) return;
  const current = values();
  const file = new Blob([exportMarkdown(current)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = intakeFilename(current["asset-name"]);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  exportStatus.textContent = "Markdown download started. Send the file to your yRisk contact on Telegram.";
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
for (const id of ["download-markdown", "print-intake"]) {
  element<HTMLButtonElement>(id).disabled = false;
}
