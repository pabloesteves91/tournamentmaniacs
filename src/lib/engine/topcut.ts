import { computeStandings } from "./standings";
import type { Division, Match, Round, Tournament } from "../types";
import { createId } from "../utils";

const nextPowerOfTwo = (value: number): number => {
  let current = 1;
  while (current < value) {
    current *= 2;
  }

  return current;
};

const seedOrder = (size: number): number[] => {
  if (size === 2) {
    return [1, 2];
  }

  const previous = seedOrder(size / 2);
  const output: number[] = [];

  for (const seed of previous) {
    output.push(seed, size + 1 - seed);
  }

  return output;
};

export const seedTopCutRound = (
  tournament: Tournament,
  division: Division,
  roundNumber: number,
  cutSize: number,
): { round: Round | null; matches: Match[] } => {
  if (cutSize <= 1) {
    return { round: null, matches: [] };
  }

  const standings = computeStandings(tournament, division);
  const seededPlayers = standings.slice(0, cutSize).map((row) => row.playerId);
  if (seededPlayers.length <= 1) {
    return { round: null, matches: [] };
  }

  const bracketSize = nextPowerOfTwo(cutSize);
  const slots = seedOrder(bracketSize).map((seed) => seededPlayers[seed - 1] ?? null);

  const matches: Match[] = [];
  let tableNumber = 1;

  for (let index = 0; index < slots.length; index += 2) {
    const playerAId = slots[index];
    const playerBId = slots[index + 1];

    if (!playerAId && !playerBId) {
      continue;
    }

    if (playerAId && !playerBId) {
      matches.push({
        id: createId("match"),
        roundNumber,
        phase: "topcut",
        division,
        tableNumber,
        playerAId,
        playerBId: null,
        isBye: true,
        result: {
          outcome: "A_WIN",
          gameWinsA: 1,
          gameWinsB: 0,
          reportedAt: new Date().toISOString(),
        },
      });
    } else if (!playerAId && playerBId) {
      matches.push({
        id: createId("match"),
        roundNumber,
        phase: "topcut",
        division,
        tableNumber,
        playerAId: playerBId,
        playerBId: null,
        isBye: true,
        result: {
          outcome: "A_WIN",
          gameWinsA: 1,
          gameWinsB: 0,
          reportedAt: new Date().toISOString(),
        },
      });
    } else {
      matches.push({
        id: createId("match"),
        roundNumber,
        phase: "topcut",
        division,
        tableNumber,
        playerAId: playerAId!,
        playerBId: playerBId!,
        isBye: false,
        result: null,
      });
    }

    tableNumber += 1;
  }

  if (matches.length === 0) {
    return { round: null, matches: [] };
  }

  const round: Round = {
    id: createId("round"),
    number: roundNumber,
    phase: "topcut",
    division,
    status: matches.every((match) => match.result !== null) ? "completed" : "pending",
    matchIds: matches.map((match) => match.id),
  };

  return { round, matches };
};

export const createNextTopCutRound = (
  tournament: Tournament,
  division: Division,
  roundNumber: number,
): { round: Round | null; matches: Match[] } => {
  const topcutRounds = tournament.rounds
    .filter((round) => round.phase === "topcut" && round.division === division)
    .sort((a, b) => a.number - b.number);

  if (topcutRounds.length === 0) {
    return { round: null, matches: [] };
  }

  const previous = topcutRounds[topcutRounds.length - 1];
  const previousMatches = tournament.matches
    .filter((match) => previous.matchIds.includes(match.id))
    .sort((a, b) => a.tableNumber - b.tableNumber);

  if (previousMatches.some((match) => match.result === null)) {
    return { round: null, matches: [] };
  }

  const winners: string[] = [];
  for (const match of previousMatches) {
    if (match.isBye || !match.playerBId) {
      winners.push(match.playerAId);
      continue;
    }

    if (!match.result || match.result.outcome === "TIE") {
      return { round: null, matches: [] };
    }

    winners.push(match.result.outcome === "A_WIN" ? match.playerAId : match.playerBId);
  }

  if (winners.length <= 1) {
    return { round: null, matches: [] };
  }

  const matches: Match[] = [];
  let tableNumber = 1;

  for (let index = 0; index < winners.length; index += 2) {
    const playerAId = winners[index];
    const playerBId = winners[index + 1] ?? null;
    if (!playerAId) {
      continue;
    }

    if (!playerBId) {
      matches.push({
        id: createId("match"),
        roundNumber,
        phase: "topcut",
        division,
        tableNumber,
        playerAId,
        playerBId: null,
        isBye: true,
        result: {
          outcome: "A_WIN",
          gameWinsA: 1,
          gameWinsB: 0,
          reportedAt: new Date().toISOString(),
        },
      });
    } else {
      matches.push({
        id: createId("match"),
        roundNumber,
        phase: "topcut",
        division,
        tableNumber,
        playerAId,
        playerBId,
        isBye: false,
        result: null,
      });
    }

    tableNumber += 1;
  }

  const round: Round = {
    id: createId("round"),
    number: roundNumber,
    phase: "topcut",
    division,
    status: matches.every((match) => match.result !== null) ? "completed" : "pending",
    matchIds: matches.map((match) => match.id),
  };

  return { round, matches };
};
