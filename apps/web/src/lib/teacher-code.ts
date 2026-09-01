const MAX_CODE_LENGTH = 12;

export function createTeacherCode(
  name: string,
  existingCodes: Iterable<string>,
): string {
  const words = name
    .normalize("NFKD")
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const base =
    (words.length > 1
      ? words.map((word) => word[0]).join("")
      : words[0]?.slice(0, 8)
    )?.toUpperCase() || "TEACHER";
  const used = new Set([...existingCodes].map((code) => code.toUpperCase()));

  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${base.slice(
      0,
      MAX_CODE_LENGTH - suffixText.length,
    )}${suffixText}`;
    if (!used.has(candidate)) return candidate;
  }
}
