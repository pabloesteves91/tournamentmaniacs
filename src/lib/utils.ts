export const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const formatPercent = (value: number): string => `${(value * 100).toFixed(2)}%`;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const avg = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((acc, current) => acc + current, 0) / values.length;
};

const mulberry32 = (seed: number): (() => number) => {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
  const next = [...items];
  const random = mulberry32(seed);

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
};

export const toCsvCell = (value: string | number): string => {
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
};
