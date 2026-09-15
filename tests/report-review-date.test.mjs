import test from "node:test";
import assert from "node:assert/strict";
import { reportReviewDate } from "../src/lib/report-review-date.mjs";

test("USD3 listing follows the review date despite an older publication date", () => {
  const body = '---\n{"publishedAt":"2026-09-08"}\n---\n\n| Review date | 14 September 2026 |\n';
  assert.equal(reportReviewDate(body, "usd3").toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(reportReviewDate(body.replace("| Review date | 14 September 2026 |", "| Review date | 15 September 2026 |"), "usd3").toISOString(), "2026-09-15T00:00:00.000Z");
});

test("missing or invalid dates fail instead of falling back to publication metadata", () => {
  for (const body of [undefined, "", "| Review date | 31 February 2026 |", "| Review date | 1 Unknown 2026 |"])
    assert.throws(() => reportReviewDate(body, "example"), /example.*valid Review date/);
  assert.equal(reportReviewDate("| Review date | 29 February 2024 |\r\n", "example").toISOString(), "2024-02-29T00:00:00.000Z");
});
