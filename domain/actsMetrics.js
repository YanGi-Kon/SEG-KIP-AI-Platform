function toNonNegativeFinite(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number;
}

export function calculateCompletionPercentage(createdDocuments, totalActRows) {
  const created = toNonNegativeFinite(createdDocuments);
  const total = toNonNegativeFinite(totalActRows);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((created / total) * 100)));
}
