export type MatchFormat = "BO1" | "BO3";
export type DivisionMode = "single" | "age";
export type Division = "junior" | "senior" | "masters";
export type TournamentPreset =
  | "league_challenge"
  | "league_cup"
  | "tcg_single_day"
  | "tcg_2025_championship";

export type Phase = "swiss" | "topcut";
export type RoundStatus = "pending" | "completed";
export type TournamentStatus = "setup" | "running" | "completed";

export interface TournamentConfig {
  name: string;
  date: string;
  preset: TournamentPreset;
  matchFormat: MatchFormat;
  roundTimerMinutes: number;
  divisionMode: DivisionMode;
  roundConfigMode: "auto" | "manual";
  manualSwissRounds?: number;
  manualTopCutSize?: number;
  allowTopCut: boolean;
}

export interface Player {
  id: string;
  name: string;
  playerId?: string;
  deckName: string;
  division: Division;
  dropped: boolean;
  dropRound: number | null;
  randomOrder: number;
}

export interface MatchResult {
  outcome: "A_WIN" | "B_WIN" | "TIE";
  gameWinsA: number;
  gameWinsB: number;
  reportedAt: string;
}

export interface Match {
  id: string;
  roundNumber: number;
  phase: Phase;
  division: Division;
  tableNumber: number;
  playerAId: string;
  playerBId: string | null;
  isBye: boolean;
  result: MatchResult | null;
}

export interface Round {
  id: string;
  number: number;
  phase: Phase;
  division: Division;
  status: RoundStatus;
  matchIds: string[];
}

export interface Tournament {
  id: string;
  config: TournamentConfig;
  players: Player[];
  rounds: Round[];
  matches: Match[];
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StandingRow {
  rank: number;
  playerId: string;
  playerName: string;
  deckName: string;
  division: Division;
  wins: number;
  losses: number;
  ties: number;
  matchPoints: number;
  oppWinPct: number;
  oppOppWinPct: number;
  hadBye: boolean;
}

export interface RoundSuggestion {
  swissRounds: number;
  topCutSize: number;
  notes?: string;
}

export interface MatchInput {
  outcome: "A_WIN" | "B_WIN" | "TIE";
  gameWinsA?: number;
  gameWinsB?: number;
}
