import { describe, expect, test } from "vitest";
import { createSwissRoundForDivision } from "../lib/engine/pairings";
import { computeStandings } from "../lib/engine/standings";
import { seedTopCutRound } from "../lib/engine/topcut";
import type { Tournament } from "../lib/types";

const baseTournament = (): Tournament => ({
  id: "t1",
  config: {
    name: "Test",
    date: "2026-04-03",
    preset: "league_cup",
    matchFormat: "BO3",
    roundTimerMinutes: 50,
    divisionMode: "single",
    roundConfigMode: "manual",
    manualSwissRounds: 3,
    manualTopCutSize: 8,
    allowTopCut: true,
  },
  players: [],
  rounds: [],
  matches: [],
  status: "setup",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("Swiss pairing", () => {
  test("assigns a BYE for odd player counts and auto-awards win points", () => {
    const tournament = baseTournament();
    tournament.players = [
      { id: "p1", name: "A", deckName: "Deck A", division: "masters", dropped: false, dropRound: null, randomOrder: 1 },
      { id: "p2", name: "B", deckName: "Deck B", division: "masters", dropped: false, dropRound: null, randomOrder: 2 },
      { id: "p3", name: "C", deckName: "Deck C", division: "masters", dropped: false, dropRound: null, randomOrder: 3 },
    ];

    const created = createSwissRoundForDivision(tournament, "masters", 1);
    expect(created.round).not.toBeNull();
    const bye = created.matches.find((match) => match.isBye);
    expect(bye).toBeTruthy();
    expect(bye?.result?.outcome).toBe("A_WIN");

    const withRound: Tournament = {
      ...tournament,
      rounds: created.round ? [created.round] : [],
      matches: created.matches,
    };

    const standings = computeStandings(withRound, "masters");
    const byePlayer = standings.find((row) => row.playerId === bye?.playerAId);
    expect(byePlayer?.matchPoints).toBe(3);
  });
});

describe("Standings", () => {
  test("orders standings by match points and win percentages", () => {
    const tournament = baseTournament();
    tournament.players = [
      { id: "p1", name: "A", deckName: "Deck A", division: "masters", dropped: false, dropRound: null, randomOrder: 1 },
      { id: "p2", name: "B", deckName: "Deck B", division: "masters", dropped: false, dropRound: null, randomOrder: 2 },
      { id: "p3", name: "C", deckName: "Deck C", division: "masters", dropped: true, dropRound: 2, randomOrder: 3 },
      { id: "p4", name: "D", deckName: "Deck D", division: "masters", dropped: false, dropRound: null, randomOrder: 4 },
    ];

    tournament.rounds = [
      { id: "r1", number: 1, phase: "swiss", division: "masters", status: "completed", matchIds: ["m1", "m2"] },
      { id: "r2", number: 2, phase: "swiss", division: "masters", status: "completed", matchIds: ["m3", "m4"] },
      { id: "r3", number: 3, phase: "swiss", division: "masters", status: "completed", matchIds: ["m5", "m6"] },
    ];

    tournament.matches = [
      { id: "m1", roundNumber: 1, phase: "swiss", division: "masters", tableNumber: 1, playerAId: "p1", playerBId: "p2", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 0, reportedAt: "t" } },
      { id: "m2", roundNumber: 1, phase: "swiss", division: "masters", tableNumber: 2, playerAId: "p3", playerBId: "p4", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 1, reportedAt: "t" } },
      { id: "m3", roundNumber: 2, phase: "swiss", division: "masters", tableNumber: 1, playerAId: "p1", playerBId: "p3", isBye: false, result: { outcome: "B_WIN", gameWinsA: 0, gameWinsB: 2, reportedAt: "t" } },
      { id: "m4", roundNumber: 2, phase: "swiss", division: "masters", tableNumber: 2, playerAId: "p2", playerBId: "p4", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 0, reportedAt: "t" } },
      { id: "m5", roundNumber: 3, phase: "swiss", division: "masters", tableNumber: 1, playerAId: "p1", playerBId: "p4", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 0, reportedAt: "t" } },
      { id: "m6", roundNumber: 3, phase: "swiss", division: "masters", tableNumber: 2, playerAId: "p2", playerBId: "p3", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 1, reportedAt: "t" } },
    ];

    const standings = computeStandings(tournament, "masters");
    expect(standings[0].playerId).toBe("p1");
    expect(standings[0].matchPoints).toBe(6);
    expect(standings[0].oppWinPct).toBeGreaterThan(0);
  });
});

describe("Top cut", () => {
  test("seeds asymmetrical cuts with bracket byes", () => {
    const tournament = baseTournament();
    tournament.players = [
      { id: "p1", name: "A", deckName: "D1", division: "masters", dropped: false, dropRound: null, randomOrder: 1 },
      { id: "p2", name: "B", deckName: "D2", division: "masters", dropped: false, dropRound: null, randomOrder: 2 },
      { id: "p3", name: "C", deckName: "D3", division: "masters", dropped: false, dropRound: null, randomOrder: 3 },
      { id: "p4", name: "D", deckName: "D4", division: "masters", dropped: false, dropRound: null, randomOrder: 4 },
      { id: "p5", name: "E", deckName: "D5", division: "masters", dropped: false, dropRound: null, randomOrder: 5 },
      { id: "p6", name: "F", deckName: "D6", division: "masters", dropped: false, dropRound: null, randomOrder: 6 },
    ];

    tournament.rounds = [
      { id: "r1", number: 1, phase: "swiss", division: "masters", status: "completed", matchIds: ["m1", "m2", "m3"] },
    ];

    tournament.matches = [
      { id: "m1", roundNumber: 1, phase: "swiss", division: "masters", tableNumber: 1, playerAId: "p1", playerBId: "p6", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 0, reportedAt: "t" } },
      { id: "m2", roundNumber: 1, phase: "swiss", division: "masters", tableNumber: 2, playerAId: "p2", playerBId: "p5", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 1, reportedAt: "t" } },
      { id: "m3", roundNumber: 1, phase: "swiss", division: "masters", tableNumber: 3, playerAId: "p3", playerBId: "p4", isBye: false, result: { outcome: "A_WIN", gameWinsA: 2, gameWinsB: 1, reportedAt: "t" } },
    ];

    const seeded = seedTopCutRound(tournament, "masters", 2, 6);
    expect(seeded.round).not.toBeNull();
    expect(seeded.matches.length).toBeGreaterThanOrEqual(3);
    expect(seeded.matches.some((match) => match.isBye)).toBe(true);
  });
});
