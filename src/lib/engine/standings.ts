import { getCompletedSwissRounds } from "./rules";
import type { Division, Match, StandingRow, Tournament } from "../types";
import { avg, clamp } from "../utils";

interface PlayerStats {
  wins: number;
  losses: number;
  ties: number;
  hadBye: boolean;
  opponents: string[];
}

const EPSILON = 0.0000001;

const getSwissMatchesByDivision = (tournament: Tournament, division: Division): Match[] =>
  tournament.matches.filter(
    (match) => match.phase === "swiss" && match.division === division && match.result !== null,
  );

const getPlayerStats = (tournament: Tournament, division: Division): Map<string, PlayerStats> => {
  const stats = new Map<string, PlayerStats>();

  for (const player of tournament.players.filter((item) => item.division === division)) {
    stats.set(player.id, {
      wins: 0,
      losses: 0,
      ties: 0,
      hadBye: false,
      opponents: [],
    });
  }

  const matches = getSwissMatchesByDivision(tournament, division);

  for (const match of matches) {
    const playerA = stats.get(match.playerAId);
    if (!playerA) {
      continue;
    }

    if (match.isBye || !match.playerBId) {
      playerA.wins += 1;
      playerA.hadBye = true;
      continue;
    }

    const playerB = stats.get(match.playerBId);
    if (!playerB) {
      continue;
    }

    playerA.opponents.push(match.playerBId);
    playerB.opponents.push(match.playerAId);

    if (match.result?.outcome === "A_WIN") {
      playerA.wins += 1;
      playerB.losses += 1;
      continue;
    }

    if (match.result?.outcome === "B_WIN") {
      playerA.losses += 1;
      playerB.wins += 1;
      continue;
    }

    playerA.ties += 1;
    playerB.ties += 1;
  }

  return stats;
};

const getPlayerWinPct = (
  tournament: Tournament,
  division: Division,
  playerId: string,
  stats: Map<string, PlayerStats>,
): number => {
  const player = tournament.players.find((item) => item.id === playerId);
  const playerStats = stats.get(playerId);

  if (!player || !playerStats) {
    return 0;
  }

  const completedSwissRounds = getCompletedSwissRounds(tournament, division);
  if (completedSwissRounds === 0) {
    return 0;
  }

  const totalPlayedNonBye = playerStats.wins + playerStats.losses + playerStats.ties - (playerStats.hadBye ? 1 : 0);
  const denominator = player.dropped ? Math.max(totalPlayedNonBye, 1) : Math.max(completedSwissRounds, 1);
  const maxCap = player.dropped ? 0.75 : 1;
  const raw = playerStats.wins / denominator;

  return clamp(raw, 0.25, maxCap);
};

const getHeadToHeadWinner = (
  tournament: Tournament,
  division: Division,
  playerAId: string,
  playerBId: string,
): string | null => {
  const direct = tournament.matches.filter(
    (match) =>
      match.phase === "swiss" &&
      match.division === division &&
      match.result !== null &&
      !match.isBye &&
      ((match.playerAId === playerAId && match.playerBId === playerBId) ||
        (match.playerAId === playerBId && match.playerBId === playerAId)),
  );

  let aWins = 0;
  let bWins = 0;

  for (const match of direct) {
    if (match.result?.outcome === "TIE") {
      continue;
    }

    const winner = match.result?.outcome === "A_WIN" ? match.playerAId : match.playerBId;
    if (winner === playerAId) {
      aWins += 1;
    } else if (winner === playerBId) {
      bWins += 1;
    }
  }

  if (aWins > bWins) {
    return playerAId;
  }

  if (bWins > aWins) {
    return playerBId;
  }

  return null;
};

export const computeStandings = (tournament: Tournament, division: Division): StandingRow[] => {
  const players = tournament.players.filter((player) => player.division === division);
  const stats = getPlayerStats(tournament, division);

  const winPctByPlayer = new Map<string, number>();
  for (const player of players) {
    winPctByPlayer.set(player.id, getPlayerWinPct(tournament, division, player.id, stats));
  }

  const oppWinPctByPlayer = new Map<string, number>();
  for (const player of players) {
    const playerStats = stats.get(player.id);
    if (!playerStats || playerStats.opponents.length === 0) {
      oppWinPctByPlayer.set(player.id, 0);
      continue;
    }

    oppWinPctByPlayer.set(
      player.id,
      avg(playerStats.opponents.map((opponentId) => winPctByPlayer.get(opponentId) ?? 0)),
    );
  }

  const rows: StandingRow[] = players.map((player) => {
    const playerStats = stats.get(player.id);
    const wins = playerStats?.wins ?? 0;
    const losses = playerStats?.losses ?? 0;
    const ties = playerStats?.ties ?? 0;
    const matchPoints = wins * 3 + ties;

    const oppOppWinPct = avg((playerStats?.opponents ?? []).map((opponentId) => oppWinPctByPlayer.get(opponentId) ?? 0));

    return {
      rank: 0,
      playerId: player.id,
      playerName: player.name,
      deckName: player.deckName,
      division: player.division,
      wins,
      losses,
      ties,
      matchPoints,
      oppWinPct: oppWinPctByPlayer.get(player.id) ?? 0,
      oppOppWinPct,
      hadBye: playerStats?.hadBye ?? false,
    };
  });

  rows.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) {
      return b.matchPoints - a.matchPoints;
    }

    if (Math.abs(b.oppWinPct - a.oppWinPct) > EPSILON) {
      return b.oppWinPct - a.oppWinPct;
    }

    if (Math.abs(b.oppOppWinPct - a.oppOppWinPct) > EPSILON) {
      return b.oppOppWinPct - a.oppOppWinPct;
    }

    return 0;
  });

  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (
      j < rows.length &&
      rows[i].matchPoints === rows[j].matchPoints &&
      Math.abs(rows[i].oppWinPct - rows[j].oppWinPct) <= EPSILON &&
      Math.abs(rows[i].oppOppWinPct - rows[j].oppOppWinPct) <= EPSILON
    ) {
      j += 1;
    }

    if (j - i === 2) {
      const a = rows[i];
      const b = rows[i + 1];
      const winner = getHeadToHeadWinner(tournament, division, a.playerId, b.playerId);
      if (winner === b.playerId) {
        rows[i] = b;
        rows[i + 1] = a;
      } else if (!winner) {
        const playerA = tournament.players.find((player) => player.id === a.playerId);
        const playerB = tournament.players.find((player) => player.id === b.playerId);
        if ((playerA?.randomOrder ?? 0) > (playerB?.randomOrder ?? 0)) {
          rows[i] = b;
          rows[i + 1] = a;
        }
      }
    } else if (j - i > 2) {
      rows
        .slice(i, j)
        .sort((rowA, rowB) => {
          const playerA = tournament.players.find((player) => player.id === rowA.playerId);
          const playerB = tournament.players.find((player) => player.id === rowB.playerId);
          return (playerA?.randomOrder ?? 0) - (playerB?.randomOrder ?? 0);
        })
        .forEach((row, idx) => {
          rows[i + idx] = row;
        });
    }

    i = j;
  }

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return rows;
};
