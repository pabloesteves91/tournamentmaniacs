import { createSwissRoundsAcrossDivisions } from "./engine/pairings";
import { getDivisionStructure, getSwissRoundsCreated, getTournamentDivisions, hasPendingRounds } from "./engine/rules";
import { computeStandings as computeStandingsByDivision } from "./engine/standings";
import { createNextTopCutRound, seedTopCutRound } from "./engine/topcut";
import { pairingsToCsv, standingsToCsv } from "./export/csv";
import { pairingsToPdfBlob, standingsToPdfBlob } from "./export/pdf";
import { loadActiveTournament, saveActiveTournament } from "./storage/db";
import type { Division, MatchInput, StandingRow, Tournament, TournamentConfig } from "./types";
import { createId } from "./utils";

export type ExportFormat = "csv" | "pdf";

const touchTournament = (tournament: Tournament): Tournament => ({
  ...tournament,
  updatedAt: new Date().toISOString(),
});

const getRoundByMatchId = (tournament: Tournament, matchId: string) =>
  tournament.rounds.find((round) => round.matchIds.includes(matchId));

const updateRoundStatuses = (tournament: Tournament): Tournament => {
  const updatedRounds = tournament.rounds.map((round) => {
    const matches = tournament.matches.filter((match) => round.matchIds.includes(match.id));
    const completed = matches.length > 0 && matches.every((match) => match.result !== null);
    return {
      ...round,
      status: completed ? ("completed" as const) : ("pending" as const),
    };
  });

  return {
    ...tournament,
    rounds: updatedRounds,
  };
};

const getLatestRoundNumber = (tournament: Tournament): number =>
  tournament.rounds.reduce((max, round) => Math.max(max, round.number), 0);

const refreshTournamentStatus = (tournament: Tournament): Tournament => {
  if (hasPendingRounds(tournament)) {
    return { ...tournament, status: "running" };
  }

  const divisions = getTournamentDivisions(tournament);

  const needsSwiss = divisions.some((division) => {
    const structure = getDivisionStructure(tournament, division);
    return getSwissRoundsCreated(tournament, division) < structure.swissRounds;
  });

  if (needsSwiss) {
    return { ...tournament, status: "running" };
  }

  if (!tournament.config.allowTopCut) {
    return { ...tournament, status: "completed" };
  }

  const needsTopCut = divisions.some((division) => {
    const structure = getDivisionStructure(tournament, division);
    if (structure.topCutSize <= 1) {
      return false;
    }

    const topcutRounds = tournament.rounds.filter((round) => round.phase === "topcut" && round.division === division);
    if (topcutRounds.length === 0) {
      return true;
    }

    const lastRound = topcutRounds.sort((a, b) => a.number - b.number)[topcutRounds.length - 1];
    const lastRoundMatches = tournament.matches.filter((match) => lastRound.matchIds.includes(match.id));

    if (lastRoundMatches.some((match) => match.result === null)) {
      return true;
    }

    return lastRoundMatches.length > 1;
  });

  return {
    ...tournament,
    status: needsTopCut ? "running" : "completed",
  };
};

const saveAndReturn = async (tournament: Tournament): Promise<Tournament> => {
  const normalized = refreshTournamentStatus(updateRoundStatuses(touchTournament(tournament)));
  await saveActiveTournament(normalized);
  return normalized;
};

const normalizeMatchResult = (
  tournament: Tournament,
  matchId: string,
  input: MatchInput,
): { outcome: "A_WIN" | "B_WIN" | "TIE"; gameWinsA: number; gameWinsB: number } => {
  const match = tournament.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error("Match not found");
  }

  if (match.phase === "topcut" && input.outcome === "TIE") {
    throw new Error("Top Cut does not allow ties");
  }

  if (tournament.config.matchFormat === "BO1") {
    if (input.outcome === "A_WIN") {
      return { outcome: input.outcome, gameWinsA: 1, gameWinsB: 0 };
    }

    if (input.outcome === "B_WIN") {
      return { outcome: input.outcome, gameWinsA: 0, gameWinsB: 1 };
    }

    return { outcome: input.outcome, gameWinsA: 0, gameWinsB: 0 };
  }

  const gameWinsA = input.gameWinsA ?? (input.outcome === "A_WIN" ? 2 : input.outcome === "B_WIN" ? 0 : 1);
  const gameWinsB = input.gameWinsB ?? (input.outcome === "B_WIN" ? 2 : input.outcome === "A_WIN" ? 0 : 1);

  return {
    outcome: input.outcome,
    gameWinsA,
    gameWinsB,
  };
};

export const createTournament = async (config: TournamentConfig): Promise<Tournament> => {
  const now = new Date().toISOString();

  const tournament: Tournament = {
    id: createId("tournament"),
    config,
    players: [],
    rounds: [],
    matches: [],
    status: "setup",
    createdAt: now,
    updatedAt: now,
  };

  await saveActiveTournament(tournament);
  return tournament;
};

export const loadTournament = async (): Promise<Tournament | null> => loadActiveTournament();

export const clearTournament = async (): Promise<void> => {
  await saveActiveTournament(null);
};

export const registerPlayer = async (
  playerInput: {
    name: string;
    deckName: string;
    division: Division;
    playerId?: string;
  },
): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  if (tournament.rounds.length > 0) {
    throw new Error("Cannot register players after round 1 has started");
  }

  const nextTournament: Tournament = {
    ...tournament,
    players: [
      ...tournament.players,
      {
        id: createId("player"),
        name: playerInput.name.trim(),
        deckName: playerInput.deckName.trim(),
        division: tournament.config.divisionMode === "single" ? "masters" : playerInput.division,
        playerId: playerInput.playerId?.trim() || undefined,
        dropped: false,
        dropRound: null,
        randomOrder: Math.floor(Math.random() * 1000000),
      },
    ],
  };

  return saveAndReturn(nextTournament);
};

export const setPlayerDropped = async (playerId: string, dropped: boolean): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  const nextTournament: Tournament = {
    ...tournament,
    players: tournament.players.map((player) => {
      if (player.id !== playerId) {
        return player;
      }

      return {
        ...player,
        dropped,
        dropRound: dropped ? getLatestRoundNumber(tournament) : null,
      };
    }),
  };

  return saveAndReturn(nextTournament);
};

export const generateNextRound = async (tournamentId: string): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament || tournament.id !== tournamentId) {
    throw new Error("Tournament not found");
  }

  if (hasPendingRounds(tournament)) {
    throw new Error("Finish all current matches before generating the next round");
  }

  const divisions = getTournamentDivisions(tournament);
  const swissEligible = divisions.filter((division) => {
    const structure = getDivisionStructure(tournament, division);
    return getSwissRoundsCreated(tournament, division) < structure.swissRounds;
  });

  if (swissEligible.length > 0) {
    const nextSwissRoundNumber =
      Math.max(
        0,
        ...tournament.rounds.filter((round) => round.phase === "swiss").map((round) => round.number),
      ) + 1;

    const created = createSwissRoundsAcrossDivisions(tournament, nextSwissRoundNumber, swissEligible);
    if (created.rounds.length === 0) {
      throw new Error("Not enough players to pair a Swiss round");
    }

    return saveAndReturn({
      ...tournament,
      rounds: [...tournament.rounds, ...created.rounds],
      matches: [...tournament.matches, ...created.matches],
      status: "running",
    });
  }

  if (!tournament.config.allowTopCut) {
    return saveAndReturn({ ...tournament, status: "completed" });
  }

  const nextRoundNumber = getLatestRoundNumber(tournament) + 1;
  const topCutRounds: typeof tournament.rounds = [];
  const topCutMatches: typeof tournament.matches = [];

  for (const division of divisions) {
    const structure = getDivisionStructure(tournament, division);
    if (structure.topCutSize <= 1) {
      continue;
    }

    const existingTopCut = tournament.rounds.some((round) => round.phase === "topcut" && round.division === division);
    const created = existingTopCut
      ? createNextTopCutRound(tournament, division, nextRoundNumber)
      : seedTopCutRound(tournament, division, nextRoundNumber, structure.topCutSize);

    if (created.round && created.matches.length > 0) {
      topCutRounds.push(created.round);
      topCutMatches.push(...created.matches);
    }
  }

  if (topCutRounds.length === 0) {
    return saveAndReturn({ ...tournament, status: "completed" });
  }

  return saveAndReturn({
    ...tournament,
    rounds: [...tournament.rounds, ...topCutRounds],
    matches: [...tournament.matches, ...topCutMatches],
    status: "running",
  });
};

export const reportMatchResult = async (matchId: string, resultInput: MatchInput): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  const match = tournament.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error("Match not found");
  }

  if (match.isBye) {
    throw new Error("Bye matches are auto-resolved");
  }

  const normalized = normalizeMatchResult(tournament, matchId, resultInput);

  const nextTournament: Tournament = {
    ...tournament,
    matches: tournament.matches.map((item) => {
      if (item.id !== matchId) {
        return item;
      }

      return {
        ...item,
        result: {
          outcome: normalized.outcome,
          gameWinsA: normalized.gameWinsA,
          gameWinsB: normalized.gameWinsB,
          reportedAt: new Date().toISOString(),
        },
      };
    }),
  };

  const affectedRound = getRoundByMatchId(nextTournament, matchId);
  if (!affectedRound) {
    throw new Error("Round not found");
  }

  return saveAndReturn(nextTournament);
};

export const amendMatchResult = async (matchId: string, resultInput: MatchInput): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  const match = tournament.matches.find((item) => item.id === matchId);
  if (!match) {
    throw new Error("Match not found");
  }

  if (match.isBye) {
    throw new Error("Bye matches are auto-resolved");
  }

  const affectedRound = getRoundByMatchId(tournament, matchId);
  if (!affectedRound) {
    throw new Error("Round not found");
  }

  const normalized = normalizeMatchResult(tournament, matchId, resultInput);

  // If an old result changes, later rounds are no longer valid and must be replayed.
  const roundsToDrop = tournament.rounds.filter((round) => round.number > affectedRound.number);
  const roundIdsToDrop = new Set(roundsToDrop.map((round) => round.id));
  const matchIdsToDrop = new Set(roundsToDrop.flatMap((round) => round.matchIds));

  const keptRounds = tournament.rounds.filter((round) => !roundIdsToDrop.has(round.id));
  const keptMatches = tournament.matches
    .filter((item) => !matchIdsToDrop.has(item.id))
    .map((item) => {
      if (item.id !== matchId) {
        return item;
      }

      return {
        ...item,
        result: {
          outcome: normalized.outcome,
          gameWinsA: normalized.gameWinsA,
          gameWinsB: normalized.gameWinsB,
          reportedAt: new Date().toISOString(),
        },
      };
    });

  return saveAndReturn({
    ...tournament,
    rounds: keptRounds,
    matches: keptMatches,
    status: "running",
  });
};

export const computeStandings = async (tournamentId: string, division: Division): Promise<StandingRow[]> => {
  const tournament = await loadActiveTournament();
  if (!tournament || tournament.id !== tournamentId) {
    throw new Error("Tournament not found");
  }

  return computeStandingsByDivision(tournament, division);
};

export const seedTopCut = async (tournamentId: string, division: Division): Promise<Tournament> => {
  const tournament = await loadActiveTournament();
  if (!tournament || tournament.id !== tournamentId) {
    throw new Error("Tournament not found");
  }

  if (hasPendingRounds(tournament)) {
    throw new Error("Cannot seed top cut while there are pending rounds");
  }

  const structure = getDivisionStructure(tournament, division);
  const roundNumber = getLatestRoundNumber(tournament) + 1;
  const seeded = seedTopCutRound(tournament, division, roundNumber, structure.topCutSize);

  if (!seeded.round || seeded.matches.length === 0) {
    throw new Error("No top cut could be seeded");
  }

  return saveAndReturn({
    ...tournament,
    rounds: [...tournament.rounds, seeded.round],
    matches: [...tournament.matches, ...seeded.matches],
    status: "running",
  });
};

export const exportStandings = async (
  format: ExportFormat,
  division: Division,
): Promise<{ filename: string; content: string | Blob }> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  const rows = computeStandingsByDivision(tournament, division);
  const suffix = `${division}-standings`;

  if (format === "csv") {
    return {
      filename: `${suffix}.csv`,
      content: standingsToCsv(rows),
    };
  }

  return {
    filename: `${suffix}.pdf`,
    content: standingsToPdfBlob(`${division.toUpperCase()} Standings`, rows),
  };
};

export const exportPairings = async (
  roundId: string,
  format: ExportFormat,
): Promise<{ filename: string; content: string | Blob }> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  const round = tournament.rounds.find((item) => item.id === roundId);
  if (!round) {
    throw new Error("Round not found");
  }

  const matches = tournament.matches.filter((match) => round.matchIds.includes(match.id));

  if (format === "csv") {
    return {
      filename: `round-${round.number}-${round.division}-pairings.csv`,
      content: pairingsToCsv(tournament, matches),
    };
  }

  return {
    filename: `round-${round.number}-${round.division}-pairings.pdf`,
    content: pairingsToPdfBlob(`Round ${round.number} ${round.division.toUpperCase()} Pairings`, tournament, matches),
  };
};

export const exportBackupJson = async (): Promise<string> => {
  const tournament = await loadActiveTournament();
  if (!tournament) {
    throw new Error("No active tournament");
  }

  return JSON.stringify(tournament, null, 2);
};

export const importBackupJson = async (raw: string): Promise<Tournament> => {
  const parsed = JSON.parse(raw) as Tournament;
  await saveActiveTournament(parsed);
  return parsed;
};
