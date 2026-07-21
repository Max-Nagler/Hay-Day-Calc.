export function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function slugify(value) {
  return normalizeName(value)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
