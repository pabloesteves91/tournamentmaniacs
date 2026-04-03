import { jsPDF } from "jspdf";
import type { Match, StandingRow, Tournament } from "../types";
import { formatPercent } from "../utils";

const getPlayerName = (tournament: Tournament, playerId: string | null): string => {
  if (!playerId) {
    return "BYE";
  }

  return tournament.players.find((player) => player.id === playerId)?.name ?? "Unknown";
};

export const standingsToPdfBlob = (title: string, rows: StandingRow[]): Blob => {
  const doc = new jsPDF();
  let y = 14;

  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;

  doc.setFontSize(10);
  for (const row of rows) {
    const line = `${row.rank}. ${row.playerName} | ${row.deckName} | ${row.wins}-${row.losses}-${row.ties} | MP ${row.matchPoints} | OWP ${formatPercent(row.oppWinPct)} | OOWP ${formatPercent(row.oppOppWinPct)}`;
    doc.text(line, 14, y);
    y += 6;

    if (y > 280) {
      doc.addPage();
      y = 14;
    }
  }

  return doc.output("blob");
};

export const pairingsToPdfBlob = (title: string, tournament: Tournament, matches: Match[]): Blob => {
  const doc = new jsPDF();
  let y = 14;

  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;

  doc.setFontSize(10);
  const sorted = [...matches].sort((a, b) => a.tableNumber - b.tableNumber);

  for (const match of sorted) {
    const result = match.result ? match.result.outcome : "PENDING";
    const line = `Table ${match.tableNumber} (${match.division.toUpperCase()}): ${getPlayerName(tournament, match.playerAId)} vs ${getPlayerName(tournament, match.playerBId)} [${result}]`;
    doc.text(line, 14, y);
    y += 6;

    if (y > 280) {
      doc.addPage();
      y = 14;
    }
  }

  return doc.output("blob");
};
