import { openDB } from "idb";
import type { Tournament } from "../types";

const DB_NAME = "maniacs-tcg-db";
const STORE_NAME = "state";
const ACTIVE_KEY = "activeTournament";

const getDb = () =>
  openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });

export const loadActiveTournament = async (): Promise<Tournament | null> => {
  const db = await getDb();
  const result = await db.get(STORE_NAME, ACTIVE_KEY);
  return (result as Tournament | undefined) ?? null;
};

export const saveActiveTournament = async (tournament: Tournament | null): Promise<void> => {
  const db = await getDb();
  if (!tournament) {
    await db.delete(STORE_NAME, ACTIVE_KEY);
    return;
  }

  await db.put(STORE_NAME, tournament, ACTIVE_KEY);
};
