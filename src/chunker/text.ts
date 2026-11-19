// ~3,563 descriptions in the source data are the literal string "null" rather than absent.
export function isUsableDescription(description?: string): description is string {
  return Boolean(description && description.trim() !== "" && description.trim() !== "null");
}

export function cleanDescription(description: string): string {
  return description.trim();
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
