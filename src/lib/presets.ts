import type { RoundSuggestion, TournamentPreset } from "./types";

type Row = {
  min: number;
  max: number;
  swiss: number;
  cut: number;
  notes?: string;
};

const challengeRows: Row[] = [
  { min: 4, max: 8, swiss: 3, cut: 0 },
  { min: 9, max: 16, swiss: 4, cut: 0 },
  { min: 17, max: 32, swiss: 5, cut: 0 },
  { min: 33, max: 64, swiss: 6, cut: 0 },
  { min: 65, max: 128, swiss: 7, cut: 0 },
  { min: 129, max: 256, swiss: 8, cut: 0 },
  { min: 257, max: 512, swiss: 9, cut: 0 },
  { min: 513, max: Number.POSITIVE_INFINITY, swiss: 10, cut: 0 },
];

const singleDayRows: Row[] = [
  { min: 4, max: 8, swiss: 3, cut: 0 },
  { min: 9, max: 12, swiss: 4, cut: 2, notes: "Asymmetrical Top 2" },
  { min: 13, max: 20, swiss: 5, cut: 2, notes: "Asymmetrical Top 2" },
  { min: 21, max: 32, swiss: 5, cut: 8 },
  { min: 33, max: 64, swiss: 6, cut: 8 },
  { min: 65, max: 128, swiss: 7, cut: 8 },
  { min: 129, max: 226, swiss: 8, cut: 8 },
  { min: 227, max: 409, swiss: 9, cut: 8 },
  { min: 410, max: Number.POSITIVE_INFINITY, swiss: 10, cut: 8 },
];

const championship2025Rows: Row[] = [
  { min: 4, max: 8, swiss: 3, cut: 0, notes: "Natural Swiss" },
  { min: 9, max: 16, swiss: 4, cut: 2, notes: "Asymmetrical Top 2" },
  { min: 17, max: 32, swiss: 6, cut: 4, notes: "Asymmetrical Top 4" },
  { min: 33, max: 64, swiss: 7, cut: 6, notes: "Asymmetrical Top 6" },
  { min: 65, max: 128, swiss: 8, cut: 8, notes: "Asymmetrical Top 8" },
  { min: 129, max: 256, swiss: 9, cut: 8, notes: "Asymmetrical Top 8" },
  { min: 257, max: 512, swiss: 10, cut: 8, notes: "Asymmetrical Top 8" },
  { min: 513, max: Number.POSITIVE_INFINITY, swiss: 11, cut: 8, notes: "Asymmetrical Top 8" },
];

const getRowsForPreset = (preset: TournamentPreset): Row[] => {
  if (preset === "league_challenge") {
    return challengeRows;
  }

  if (preset === "league_cup" || preset === "tcg_single_day") {
    return singleDayRows;
  }

  return championship2025Rows;
};

export const suggestStructure = (preset: TournamentPreset, playerCount: number): RoundSuggestion => {
  const rows = getRowsForPreset(preset);
  const selected = rows.find((row) => playerCount >= row.min && playerCount <= row.max) ?? rows[rows.length - 1];

  return {
    swissRounds: selected.swiss,
    topCutSize: selected.cut,
    notes: selected.notes,
  };
};
