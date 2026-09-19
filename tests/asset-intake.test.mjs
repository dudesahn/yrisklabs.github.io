import test from "node:test";
import assert from "node:assert/strict";
import {
  intakeFields, intakeQuestions, missingFields, parseDraft, serializeDraft,
  exportMarkdown, intakeFilename,
} from "../src/lib/asset-intake.mjs";

const completed = () => Object.fromEntries(intakeFields.map(({ id }) => [id, "N/A"]));

test("exports require every detail and narrative, rejecting whitespace but accepting No and N/A", () => {
  assert.equal(missingFields({}).length, 14);
  for (const { id } of intakeFields) {
    const values = { ...completed(), [id]: " \n\t " };
    assert.deepEqual(missingFields(values).map((field) => field.id), [id]);
    assert.throws(() => exportMarkdown(values), /Complete every field/);
  }
  assert.deepEqual(missingFields({ ...completed(), access: "No" }), []);
});

test("incomplete drafts round-trip Unicode, line breaks and full long answers without requiring completion", () => {
  const values = { ...completed(), "asset-name": "", backing: "Réserves 日本語\n\n" + "Long answer. ".repeat(10000) };
  assert.deepEqual(parseDraft(serializeDraft(values)), values);
});

test("draft restoration rejects malformed data and ignores unknown properties", () => {
  for (const raw of ["broken", "null", "[]", "{}", JSON.stringify({ version: 2, values: completed() }),
    JSON.stringify({ version: 1, values: { ...completed(), access: {} } })]) {
    assert.throws(() => parseDraft(raw));
  }
  const raw = JSON.stringify({ version: 1, values: { ...completed(), unexpected: "ignored" } });
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
  assert.equal(intakeFilename("../USD Test / Asset"), "yrisk-asset-intake-usd-test-asset.md");
  assert.equal(intakeFilename("日本語"), "yrisk-asset-intake-asset.md");
  assert.ok(intakeFilename("a".repeat(200)).length < 110);
});
