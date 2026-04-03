import { suggestStructure } from "../presets";
import type { Division, Tournament } from "../types";

export const DIVISION_ORDER: Division[] = ["junior", "senior", "masters"];

export interface DivisionStructure {
  swissRounds: number;
  topCutSize: number;
  notes?: string;
}

export const getTournamentDivisions = (tournament: Tournament): Division[] => {
  if (tournament.config.divisionMode === "single") {
    return ["masters"];
  }

  const used = DIVISION_ORDER.filter((division) =>
    tournament.players.some((player) => player.division === division),
  );

  return used.length > 0 ? used : ["masters"];
};

export const getDivisionPlayerCount = (tournament: Tournament, division: Division): number =>
  tournament.players.filter((player) => player.division === division).length;

export const getDivisionStructure = (tournament: Tournament, division: Division): DivisionStructure => {
  const playerCount = getDivisionPlayerCount(tournament, division);

  if (tournament.config.roundConfigMode === "manual") {
    return {
      swissRounds: tournament.config.manualSwissRounds ?? 3,
      topCutSize: tournament.config.allowTopCut ? Math.max(0, tournament.config.manualTopCutSize ?? 0) : 0,
      notes: "Manual override",
    };
  }

  const suggested = suggestStructure(tournament.config.preset, Math.max(playerCount, 4));

  return {
    swissRounds: suggested.swissRounds,
    topCutSize: tournament.config.allowTopCut ? suggested.topCutSize : 0,
    notes: suggested.notes,
  };
};

export const getCompletedSwissRounds = (tournament: Tournament, division: Division): number => {
  const rounds = tournament.rounds.filter(
    (round) => round.phase === "swiss" && round.division === division && round.status === "completed",
  );

  return rounds.length;
};

export const getSwissRoundsCreated = (tournament: Tournament, division: Division): number => {
  const rounds = tournament.rounds.filter((round) => round.phase === "swiss" && round.division === division);
  return rounds.length;
};

export const hasPendingRounds = (tournament: Tournament): boolean =>
  tournament.rounds.some((round) => round.status === "pending");
