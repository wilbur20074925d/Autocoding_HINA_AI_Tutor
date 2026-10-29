/** Trailing reflection question — same heuristic as the web AI Tutor chat. */
export function extractTrailingQuestion(content: string): string | null {
  const withoutCode = content.replace(/```[\s\S]*?```/g, '').trim();
  const lines = withoutCode
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last || !last.endsWith('?')) return null;
  const cleaned = last
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/\*\*/g, '')
    .trim();
  if (cleaned.length < 12 || cleaned.length > 220) return null;
  return cleaned;
}
