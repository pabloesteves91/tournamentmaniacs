import { computeStandings } from "./standings";
import { getTournamentDivisions } from "./rules";
import type { Division, Match, Player, Round, Tournament } from "../types";
import { createId, shuffleWithSeed } from "../utils";

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const hasPlayed = (history: Set<string>, playerAId: string, playerBId: string): boolean =>
  history.has(pairKey(playerAId, playerBId));

const pairByBacktracking = (
  players: Player[],
  history: Set<string>,
  allowRematches: boolean,
): Array<[Player, Player]> | null => {
  if (players.length === 0) {
    return [];
  }

  const [first, ...rest] = players;
  for (let i = 0; i < rest.length; i += 1) {
    const candidate = rest[i];
    if (!allowRematches && hasPlayed(history, first.id, candidate.id)) {
      continue;
    }

    const next = [...rest.slice(0, i), ...rest.slice(i + 1)];
    const result = pairByBacktracking(next, history, allowRematches);
    if (result) {
      return [[first, candidate], ...result];
    }
  }

  return null;
};

const buildHistory = (tournament: Tournament, division: Division): Set<string> => {
  const history = new Set<string>();

  for (const match of tournament.matches) {
    if (match.division !== division || match.phase !== "swiss" || !match.playerBId) {
      continue;
    }

    history.add(pairKey(match.playerAId, match.playerBId));
  }

  return history;
};

const getPlayersWithBye = (tournament: Tournament, division: Division): Set<string> => {
  const byePlayers = new Set<string>();
  for (const match of tournament.matches) {
    if (match.phase === "swiss" && match.division === division && match.isBye) {
      byePlayers.add(match.playerAId);
    }
  }

  return byePlayers;
};

const pickByePlayer = (players: Player[], tournament: Tournament, division: Division): Player => {
  const standings = computeStandings(tournament, division);
  const pointsByPlayer = new Map(standings.map((row) => [row.playerId, row.matchPoints]));
  const byePlayers = getPlayersWithBye(tournament, division);

  const sorted = [...players].sort((a, b) => {
    const pointsA = pointsByPlayer.get(a.id) ?? 0;
    const pointsB = pointsByPlayer.get(b.id) ?? 0;

    if (pointsA !== pointsB) {
      return pointsA - pointsB;
    }

    const aHasBye = byePlayers.has(a.id);
    const bHasBye = byePlayers.has(b.id);
    if (aHasBye !== bHasBye) {
      return aHasBye ? 1 : -1;
    }

    return a.randomOrder - b.randomOrder;
  });

  return sorted[0];
};

const pairRoundOne = (players: Player[]): Array<[Player, Player]> => {
  const shuffled = shuffleWithSeed(players, Date.now());
  const pairs: Array<[Player, Player]> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  return pairs;
};

const pairLaterRounds = (
  players: Player[],
  tournament: Tournament,
  division: Division,
): { pairs: Array<[Player, Player]>; byePlayer: Player | null } => {
  const standings = computeStandings(tournament, division);
  const pointsByPlayer = new Map(standings.map((row) => [row.playerId, row.matchPoints]));
  const sorted = [...players].sort((a, b) => {
    const pointsA = pointsByPlayer.get(a.id) ?? 0;
    const pointsB = pointsByPlayer.get(b.id) ?? 0;
    if (pointsB !== pointsA) {
      return pointsB - pointsA;
    }

    return a.randomOrder - b.randomOrder;
  });

  const groups = new Map<number, Player[]>();
  for (const player of sorted) {
    const points = pointsByPlayer.get(player.id) ?? 0;
    const group = groups.get(points) ?? [];
    group.push(player);
    groups.set(points, group);
  }

  const pointBuckets = [...groups.keys()].sort((a, b) => b - a);
  const history = buildHistory(tournament, division);
  const pairs: Array<[Player, Player]> = [];
  let byePlayer: Player | null = null;
  let carry: Player[] = [];

  for (let index = 0; index < pointBuckets.length; index += 1) {
    const points = pointBuckets[index];
    const bucket = [...carry, ...(groups.get(points) ?? [])];
    carry = [];

    if (bucket.length % 2 === 1) {
      const isLastBucket = index === pointBuckets.length - 1;
      if (!isLastBucket) {
        const downPair = bucket.pop();
        if (downPair) {
          carry = [downPair];
        }
      } else {
        byePlayer = pickByePlayer(bucket, tournament, division);
        const byeIndex = bucket.findIndex((player) => player.id === byePlayer?.id);
        if (byeIndex >= 0) {
          bucket.splice(byeIndex, 1);
        }
      }
    }

    if (bucket.length > 0) {
      const strictPairs = pairByBacktracking(bucket, history, false);
      const fallbackPairs = strictPairs ?? pairByBacktracking(bucket, history, true);
      if (fallbackPairs) {
        pairs.push(...fallbackPairs);
      }
    }
  }

  if (carry.length === 1 && !byePlayer) {
    byePlayer = carry[0];
  }

  return { pairs, byePlayer };
};

export const createSwissRoundForDivision = (
  tournament: Tournament,
  division: Division,
  roundNumber: number,
): { round: Round | null; matches: Match[] } => {
  const activePlayers = tournament.players.filter((player) => player.division === division && !player.dropped);
  if (activePlayers.length < 2) {
    return { round: null, matches: [] };
  }

  const isRoundOne = !tournament.rounds.some((round) => round.phase === "swiss" && round.division === division);
  const pairingResult = isRoundOne
    ? { pairs: pairRoundOne(activePlayers), byePlayer: activePlayers.length % 2 === 1 ? pickByePlayer(activePlayers, tournament, division) : null }
    : pairLaterRounds(activePlayers, tournament, division);

  const matches: Match[] = [];
  let tableNumber = 1;

  for (const [playerA, playerB] of pairingResult.pairs) {
    matches.push({
      id: createId("match"),
      roundNumber,
      phase: "swiss",
      division,
      tableNumber,
      playerAId: playerA.id,
      playerBId: playerB.id,
      isBye: false,
      result: null,
    });
    tableNumber += 1;
  }

  if (pairingResult.byePlayer) {
    matches.push({
      id: createId("match"),
      roundNumber,
      phase: "swiss",
      division,
      tableNumber,
      playerAId: pairingResult.byePlayer.id,
      playerBId: null,
      isBye: true,
      result: {
        outcome: "A_WIN",
        gameWinsA: 1,
        gameWinsB: 0,
        reportedAt: new Date().toISOString(),
      },
    });
  }

  const round: Round = {
    id: createId("round"),
    number: roundNumber,
    phase: "swiss",
    division,
    status: matches.every((match) => match.result !== null) ? "completed" : "pending",
    matchIds: matches.map((match) => match.id),
  };

  return { round, matches };
};

export const createSwissRoundsAcrossDivisions = (
  tournament: Tournament,
  roundNumber: number,
  eligibleDivisions: Division[],
): { rounds: Round[]; matches: Match[] } => {
  const rounds: Round[] = [];
  const matches: Match[] = [];

  const allDivisions = getTournamentDivisions(tournament).filter((division) => eligibleDivisions.includes(division));
  for (const division of allDivisions) {
    const created = createSwissRoundForDivision(tournament, division, roundNumber);
    if (created.round && created.matches.length > 0) {
      rounds.push(created.round);
      matches.push(...created.matches);
    }
  }

  return { rounds, matches };
};
