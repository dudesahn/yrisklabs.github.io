export const intakeTitle = "yRisk Asset Review Intake";
export const intakeIntroduction = "We'd appreciate your team's perspective on the points below, especially anything that isn't easy to find in the docs or onchain.";
export const intakeSupportingMaterial = "If you have an existing diligence pack or other useful material, please include it when sending your downloaded responses.";
export const intakeConfidentiality = "For anything confidential, we'll discuss how to share and use it first.";

export const detailFields = [
  { id: "asset-name", label: "Asset name", group: "asset", autocomplete: "off" },
  { id: "asset-symbol", label: "Asset symbol", group: "asset", autocomplete: "off" },
  { id: "chain", label: "Chain", group: "asset", autocomplete: "off" },
  { id: "contract-address", label: "Contract address", group: "asset", autocomplete: "off" },
  { id: "respondent-name", label: "Your name", group: "contact", autocomplete: "name" },
  { id: "role-team", label: "Role / team", group: "contact", autocomplete: "off" },
  { id: "contact", label: "Best way to reach you or your team", group: "contact", autocomplete: "off" },
];

export const intakeQuestions = [
  {
    id: "access",
    label: "Who can mint, hold and redeem?",
    description: "Any eligibility requirements, exceptions or circumstances that change access, including any whitelisting or blacklisting powers held by governance or the owner role?",
  },
  {
    id: "permissions",
    label: "How did you choose the controls around sensitive permissions?",
    description: "For multisigs or token voting that can upgrade contracts, move funds or pause redemptions, what informed the setup? What safeguards address potential mistakes, compromised signers or governance attacks?",
  },
  {
    id: "backing",
    label: "What should we understand about the backing?",
    description: "Where it's held, who controls it, and how we can track and independently verify the reserves or portfolio, including any available APIs, dashboards or reporting feeds.",
  },
  {
    id: "redemptions",
    label: "How do redemptions work in practice?",
    description: "Usual timing, how larger requests are funded, and what can affect the wait, such as withdrawal queues, cross-chain bridging or recalling real-world loans.",
  },
  {
    id: "liquidity",
    label: "What should we know about liquidity?",
    description: "Any context on market-maker support, incentives or other arrangements behind the visible pool depth.",
  },
  {
    id: "developments",
    label: "What recent developments should our review reflect?",
    description: "Recent changes, upcoming plans, or lessons from past issues that the docs haven't caught up with.",
  },
  {
    id: "context",
    label: "What do people tend to miss about the asset?",
    description: "Any useful context or common misunderstandings we should keep in mind?",
  },
];

export const intakeFields = [...detailFields, ...intakeQuestions];
export const draftKey = "yrisk:asset-intake:draft:v1";

/** @param {Record<string, string>} values */
export function missingFields(values) {
  return intakeFields.filter(({ id }) => !values[id]?.trim());
}

/** Validate saved data before it reaches form controls. @param {string} raw */
export function parseDraft(raw) {
  const draft = JSON.parse(raw);
  if (!draft || draft.version !== 1 || !draft.values ||
      typeof draft.values !== "object" || Array.isArray(draft.values) ||
      intakeFields.some(({ id }) => typeof draft.values[id] !== "string")) {
    throw new Error("Unrecognized intake draft");
  }
  return Object.fromEntries(intakeFields.map(({ id }) => [id, draft.values[id]]));
}

/** @param {Record<string, string>} values */
export function serializeDraft(values) {
  return JSON.stringify({
    version: 1,
    values: Object.fromEntries(intakeFields.map(({ id }) => [id, values[id] ?? ""])),
  });
}

// Answers are plain text. Keep paragraphs and simple lists, but prevent pasted
// HTML, images, links or headings from becoming active document markup.
/** @param {string} value */
function markdownText(value) {
  return value.trim().replace(/\r\n?/g, "\n").replace(/[\\`*_{}\[\]<>#!|~]/g, "\\$&");
}

/** @param {Record<string, string>} values */
export function exportMarkdown(values) {
  if (missingFields(values).length) throw new Error("Complete every field before exporting.");
  const lines = [`# ${intakeTitle}`, "", intakeIntroduction, "", "## Asset details", ""];
  for (const group of ["asset", "contact"]) {
    if (group === "contact") lines.push("## Contact details", "");
    for (const field of detailFields.filter((field) => field.group === group)) {
      lines.push(`**${field.label}:** ${markdownText(values[field.id])}`, "");
    }
  }
  intakeQuestions.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${question.label}`, "", question.description, "",
      markdownText(values[question.id]), "");
  });
  lines.push("---", "", `${intakeSupportingMaterial} ${intakeConfidentiality}`, "");
  return lines.join("\n");
}

/** @param {string} assetName */
export function intakeFilename(assetName) {
  const slug = assetName.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
  return `yrisk-asset-intake-${slug || "asset"}.md`;
}
