export function formatDreamCardTitle(title_kid: string): string {
  const trimmed = title_kid.trim();
  if (trimmed.length === 0) return "";
  const sentenceCased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const last = sentenceCased.charAt(sentenceCased.length - 1);
  if (last === "." || last === "!" || last === "?") return sentenceCased;
  return `${sentenceCased}.`;
}
