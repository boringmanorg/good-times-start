/**
 * "8A-8H" → 8A … 8H; "11-14" → 11 … 14; "11, 12, 666" as typed. Ranges are capped at 40.
 */
export function expandLabels(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.replace(/\s*-\s*/g, "-").split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)) {
    const letters = /^(\w*?\d+)([A-Za-z])-(?:\w*?\d+)?([A-Za-z])$/.exec(raw);
    const numbers = /^(\d+)-(\d+)$/.exec(raw);
    if (letters) {
      const [, base, a, b] = letters as unknown as [string, string, string, string];
      const from = a.toUpperCase().charCodeAt(0), to = b.toUpperCase().charCodeAt(0);
      for (let c = from; c <= to && out.length < 40; c++) out.push(`${base}${String.fromCharCode(c)}`);
    } else if (numbers) {
      const from = Number(numbers[1]), to = Number(numbers[2]);
      for (let n = from; n <= to && out.length < 40; n++) out.push(String(n));
    } else out.push(raw);
  }
  return [...new Set(out)].slice(0, 40);
}
