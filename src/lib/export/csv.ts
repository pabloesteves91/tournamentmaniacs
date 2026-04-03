import type { Match, StandingRow, Tournament } from "../types";
import { toCsvCell } from "../utils";

export const standingsToCsv = (rows: StandingRow[]): string => {
  const header = [
    "Rank",
    "Player",
    "Deck",
    "Division",
    "W",
    "L",
    "T",
    "Match Points",
    "Opp Win %",
    "Opp Opp Win %",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.rank,
        row.playerName,
        row.deckName,
        row.division,
        row.wins,
        row.losses,
        row.ties,
        row.matchPoints,
        row.oppWinPct.toFixed(4),
        row.oppOppWinPct.toFixed(4),
      ]
        .map(toCsvCell)
        .join(","),
    );
  }

  return lines.join("\n");
};

const getPlayerName = (tournament: Tournament, playerId: string | null): string => {
  if (!playerId) {
    return "BYE";
  }

  return tournament.players.find((player) => player.id === playerId)?.name ?? "Unknown";
};

export const pairingsToCsv = (tournament: Tournament, matches: Match[]): string => {
  const header = ["Table", "Division", "Player A", "Player B", "Result"];
  const lines = [header.join(",")];

  const sorted = [...matches].sort((a, b) => a.tableNumber - b.tableNumber);
  for (const match of sorted) {
    const result = match.result ? match.result.outcome : "PENDING";
    lines.push(
      [match.tableNumber, match.division, getPlayerName(tournament, match.playerAId), getPlayerName(tournament, match.playerBId), result]
        .map(toCsvCell)
        .join(","),
    );
  }

  return lines.join("\n");
};
