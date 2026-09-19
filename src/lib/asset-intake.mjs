export const intakeTitle = "yRisk Asset Review Intake";
export const intakeIntroduction = "Before yRisk begins its review, please share your asset and protocol information, especially what isn’t clear from the docs or onchain data.";
export const intakeSupportingMaterial = "If you have an existing diligence pack or other useful material, please include it when sending your downloaded responses.";
export const intakeConfidentiality = "For anything confidential, we'll discuss how to share and use it first.";

export const detailFields = [
  { id: "asset-name", label: "Asset name", group: "asset", autocomplete: "off" },
  { id: "asset-symbol", label: "Asset symbol", group: "asset", autocomplete: "off" },
  { id: "chain", label: "Chain", group: "asset", autocomplete: "off" },
  { id: "contract-address", label: "Contract address", group: "asset", autocomplete: "off" },
  { id: "respondent-name", label: "Your name", group: "contact", autocomplete: "name" },
  { id: "role-team", label: "Role / team", group: "contact", autocomplete: "off" },
  { id: "email", label: "Email", group: "contact", autocomplete: "email" },
  { id: "telegram", label: "Telegram", group: "contact", autocomplete: "off" },
];

export const intakeQuestions = [
  {
    id: "access",
    label: "Who can mint, hold and redeem?",
    description: "Eligibility, exceptions, and who can whitelist or blacklist users.",
  },
  {
    id: "permissions",
    label: "Why were these permission controls chosen?",
    description: "Upgrade, fund movement and pause powers; multisig or voting design; safeguards against mistakes, compromised signers and governance attacks.",
  },
  {
    id: "backing",
    label: "How is the asset backed?",
    description: "Custody, control and independent verification. Link reserve reports, dashboards or APIs.",
  },
  {
    id: "redemptions",
    label: "How do redemptions work in practice?",
    description: "Timing, funding for large requests, and delays from queues, bridging or loan recalls.",
  },
  {
    id: "liquidity",
    label: "What supports onchain liquidity?",
    description: "Market makers, programmatic support, incentives and other arrangements.",
  },
  {
    id: "developments",
    label: "What's new or planned?",
    description: "Recent releases, upcoming changes and anything not yet documented.",
  },
  {
    id: "context",
    label: "What do people tend to miss?",
    description: "Common misunderstandings or overlooked risks.",
  },
];

export const intakeFields = [...detailFields, ...intakeQuestions];
export const draftKey = "yrisk:asset-intake:draft:v1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {Record<string, string>} values */
export function invalidFields(values) {
  return intakeFields.filter(({ id }) => {
    if (id === "telegram") return false;
    if (id === "email") return values.email?.trim()
      ? !emailPattern.test(values.email.trim())
      : !values.telegram?.trim();
    return !values[id]?.trim();
  });
}

/** Validate saved data before it reaches form controls. @param {string} raw */
export function parseDraft(raw) {
  const draft = JSON.parse(raw);
  if (!draft || ![1, 2].includes(draft.version) || !draft.values ||
      typeof draft.values !== "object" || Array.isArray(draft.values)) {
    throw new Error("Unrecognized intake draft");
  }
  if (draft.version === 1) {
    if (typeof draft.values.contact !== "string") throw new Error("Unrecognized intake draft");
    const contact = draft.values.contact;
    const isEmail = emailPattern.test(contact.trim());
    draft.values = { ...draft.values, email: isEmail ? contact : "", telegram: isEmail ? "" : contact };
  }
  if (intakeFields.some(({ id }) => typeof draft.values[id] !== "string")) throw new Error("Unrecognized intake draft");
  return Object.fromEntries(intakeFields.map(({ id }) => [id, draft.values[id]]));
}

/** @param {Record<string, string>} values */
export function serializeDraft(values) {
  return JSON.stringify({
    version: 2,
    values: Object.fromEntries(intakeFields.map(({ id }) => [id, values[id] ?? ""])),
  });
}

// Answers are plain text. Keep paragraphs and simple lists, but prevent pasted
// HTML, images, links or headings from becoming active document markup.
/** @param {string} value */
function markdownText(value) {
  return value.trim().replace(/\r\n?/g, "\n").replace(/[\\`*_{}\[\]<>#!|~]/g, "\\$&");
}

/** A shared UTC date keeps downloaded, copied and printed responses consistent. @param {Date} date */
export function intakeExportDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** @param {Record<string, string>} values @param {Date} exportedAt */
export function exportMarkdown(values, exportedAt = new Date()) {
  if (invalidFields(values).length) throw new Error("Complete the required fields before exporting.");
  const lines = [`# ${intakeTitle}`, "", `Exported (UTC): ${intakeExportDate(exportedAt)}`, "",
    intakeIntroduction, "", "## Asset details", ""];
  for (const group of ["asset", "contact"]) {
    if (group === "contact") lines.push("## Contact details", "");
    for (const field of detailFields.filter((field) => field.group === group)) {
      if (values[field.id]?.trim()) lines.push(`**${field.label}:** ${markdownText(values[field.id])}`, "");
    }
  }
  intakeQuestions.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${question.label}`, "", question.description, "", "**Response:**", "",
      markdownText(values[question.id]), "");
  });
  lines.push("---", "", `${intakeSupportingMaterial} ${intakeConfidentiality}`, "");
  return lines.join("\n");
}

/** @param {string} assetName @param {Date} exportedAt */
export function intakeFilename(assetName, exportedAt = new Date()) {
  const slug = assetName.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
  return `yrisk-asset-intake-${slug || "asset"}-${intakeExportDate(exportedAt)}.md`;
}
