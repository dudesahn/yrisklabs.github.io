import test from "node:test";
import assert from "node:assert/strict";
import {
  intakeFields, intakeQuestions, invalidFields, parseDraft, serializeDraft,
  exportMarkdown, intakeFilename, intakeExportDate,
} from "../src/lib/asset-intake.mjs";

const completed = () => ({ ...Object.fromEntries(intakeFields.map(({ id }) => [id, "N/A"])), email: "", telegram: "@asset_team" });

test("exports require every detail and narrative, rejecting whitespace but accepting No and N/A", () => {
  assert.equal(invalidFields({}).length, 14);
  for (const { id } of intakeFields.filter(({ id }) => !["email", "telegram"].includes(id))) {
    const values = { ...completed(), [id]: " \n\t " };
    assert.deepEqual(invalidFields(values).map((field) => field.id), [id]);
    assert.throws(() => exportMarkdown(values), /required fields/);
  }
  assert.deepEqual(invalidFields({ ...completed(), access: "No" }), []);
});

test("incomplete drafts round-trip Unicode, line breaks and full long answers without requiring completion", () => {
  const values = { ...completed(), "asset-name": "", backing: "Réserves 日本語\n\n" + "Long answer. ".repeat(10000) };
  assert.deepEqual(parseDraft(serializeDraft(values)), values);
});

test("draft restoration rejects malformed data and ignores unknown properties", () => {
  for (const raw of ["broken", "null", "[]", "{}", JSON.stringify({ version: 3, values: completed() }),
    JSON.stringify({ version: 2, values: { ...completed(), access: {} } })]) {
    assert.throws(() => parseDraft(raw));
  }
  const raw = JSON.stringify({ version: 2, values: { ...completed(), unexpected: "ignored" } });
  assert.deepEqual(parseDraft(raw), completed());
});

test("Markdown contains every complete prompt, detail and untruncated narrative", () => {
  const narrative = "First paragraph.\n\n- First item\n- Second item\n\n" + "More detail. ".repeat(1000) + "Final sentence.";
  const values = { ...completed(), "asset-name": "Example asset", backing: narrative };
  const markdown = exportMarkdown(values);
  assert.ok(markdown.startsWith("# yRisk Asset Review Intake\n"));
  assert.ok(markdown.includes("**Asset name:** Example asset"));
  intakeQuestions.forEach((question, index) => {
    assert.ok(markdown.includes(`## ${index + 1}. ${question.label}\n`));
    assert.ok(markdown.includes(question.description));
  });
  assert.ok(markdown.includes(narrative));
});

test("respondent markup remains literal rather than introducing HTML or embedded images", () => {
  const markdown = exportMarkdown({ ...completed(), context: '<script>alert(1)</script>\n![tracking](https://example.com/a.png)\n# Forged heading\n```html\ntext\n```' });
  assert.ok(markdown.includes('\\<script\\>alert(1)\\</script\\>'));
  assert.ok(markdown.includes('\\!\\[tracking\\]'));
  assert.ok(!markdown.includes('\n# Forged heading'));
  assert.ok(!markdown.includes('\n```'));
});

test("download filenames cannot contain paths and remain bounded", () => {
  const date = new Date("2026-09-18T23:59:59Z");
  assert.equal(intakeFilename("../USD Test / Asset", date), "yrisk-asset-intake-usd-test-asset-2026-09-18.md");
  assert.equal(intakeFilename("日本語", date), "yrisk-asset-intake-asset-2026-09-18.md");
  assert.ok(intakeFilename("a".repeat(200), date).length < 120);
});

test("export dates agree across document and filename at a UTC day boundary", () => {
  const date = new Date("2026-09-18T20:30:00-04:00");
  assert.equal(intakeExportDate(date), "2026-09-19");
  assert.ok(exportMarkdown(completed(), date).includes("Exported (UTC): 2026-09-19"));
  assert.ok(intakeFilename("Example", date).endsWith("-2026-09-19.md"));
});

test("exports separate each prompt from its answer and preserve ordinary links and lists", () => {
  const answer = "First paragraph.\n\n- Detail one\n- Detail two\n\nhttps://example.com/reserves?asset=usd&chain=1";
  const values = { ...completed(), backing: answer };
  const markdown = exportMarkdown(values);
  assert.equal(markdown.match(/\*\*Response:\*\*/g)?.length, intakeQuestions.length);
  assert.ok(markdown.includes(`${intakeQuestions[2].description}\n\n**Response:**\n\n${answer}`));
});

test("draft validation rejects missing, null, numeric, and array-valued fields individually", () => {
  for (const { id } of intakeFields) {
    for (const invalid of [undefined, null, 1, false, [], {}]) {
      assert.throws(() => parseDraft(JSON.stringify({ version: 2, values: { ...completed(), [id]: invalid } })));
    }
  }
});

test("drafts whitelist known fields and normalize an initially empty form", () => {
  assert.deepEqual(parseDraft(serializeDraft({})), Object.fromEntries(intakeFields.map(({ id }) => [id, ""])));
  const data = JSON.parse('{"version":2,"values":{"__proto__":{"injected":true}}}');
  Object.assign(data.values, completed());
  const parsed = parseDraft(JSON.stringify(data));
  assert.equal(Object.hasOwn(parsed, "__proto__"), false);
  assert.equal(parsed.injected, undefined);
  assert.equal({}.injected, undefined);
});

test("exports normalize Windows line endings without losing Unicode or breaking literal markup", () => {
  const values = { ...completed(), backing: '  Réserves 日本語\r\n\r\n[link](javascript:alert(1))\r\n\\<script>\r\n' };
  const result = exportMarkdown(values);
  assert.ok(!result.includes("\r"));
  assert.ok(result.includes("Réserves 日本語\n\n\\[link\\](javascript:alert(1))"));
  assert.ok(result.includes("\\\\\\<script\\>"));
});

test("either email or Telegram is sufficient, but supplied email must be valid", () => {
  for (const contact of [{ email: "team@example.org", telegram: "" }, { email: "", telegram: "@asset_team" },
    { email: "team@example.org", telegram: "@asset_team" }]) {
    assert.deepEqual(invalidFields({ ...completed(), ...contact }), []);
  }
  for (const contact of [{ email: "", telegram: " " }, { email: "bad email", telegram: "@asset_team" }]) {
    assert.deepEqual(invalidFields({ ...completed(), ...contact }).map(({ id }) => id), ["email"]);
    assert.throws(() => exportMarkdown({ ...completed(), ...contact }), /required fields/);
  }
  const markdown = exportMarkdown({ ...completed(), email: "team@example.org", telegram: "" });
  assert.ok(markdown.includes("**Email:** team@example.org"));
  assert.ok(!markdown.includes("**Telegram:**"));
});

test("legacy contact drafts preserve every answer and migrate without dropping free text", () => {
  for (const contact of ["team@example.org", "@asset_team", "Contact Alice via the team chat", ""]) {
    const { email, telegram, ...values } = completed();
    const restored = parseDraft(JSON.stringify({ version: 1, values: { ...values, contact } }));
    assert.equal(restored.email || restored.telegram, contact);
    assert.equal(restored.email, contact === "team@example.org" ? contact : "");
    for (const [id, value] of Object.entries(values)) assert.equal(restored[id], value);
    assert.deepEqual(parseDraft(serializeDraft(restored)), restored);
  }
});
