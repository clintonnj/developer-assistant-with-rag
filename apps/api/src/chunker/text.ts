// ~3,563 descriptions in the source data are the literal string "null" rather than absent.
export function isUsableDescription(description?: string): description is string {
  return Boolean(description && description.trim() !== "" && description.trim() !== "null");
}

// Many descriptions contain embedded newlines and irregular spacing (the source is prose
// copy-pasted into JSON). Collapsed to single spaces so a description never breaks a single
// "field (type): description" line into continuation fragments.
export function cleanDescription(description: string): string {
  return description.trim().replace(/\s+/g, " ");
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
