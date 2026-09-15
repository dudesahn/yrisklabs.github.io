const months = "January February March April May June July August September October November December".split(" ");

/** Read the authoritative review date from a report's Markdown table. */
export function reportReviewDate(body, id) {
  const match = body?.match(/^\|\s*Review date\s*\|\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*\|\s*$/m);
  if (match) {
    const [, day, month, year] = match;
    const monthIndex = months.indexOf(month);
    const date = new Date(`${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    if (monthIndex >= 0 && date.getUTCFullYear() === Number(year) &&
        date.getUTCMonth() === monthIndex && date.getUTCDate() === Number(day)) return date;
  }
  throw new Error(`Report "${id}" needs a valid Review date table row (D Month YYYY).`);
}
