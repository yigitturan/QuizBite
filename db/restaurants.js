// db/restaurants.js
import * as SQLite from "expo-sqlite";

let db; // singleton

export async function getDB() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("quizbite.db");
  return db;
}

export async function initDB() {
  const dbi = await getDB();
  await dbi.execAsync("PRAGMA journal_mode = WAL;");
  await dbi.execAsync(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // Seed sadece boşsa
  const rows = await dbi.getAllAsync("SELECT id FROM restaurants LIMIT 1;");
  if (!rows || rows.length === 0) {
    const seed = ["Zeytin Restaurant", "Cat Cafe", "Olive Garden (Demo)", "Anadolu Diner"];
    for (const n of seed) {
      try {
        await dbi.runAsync("INSERT OR IGNORE INTO restaurants (name) VALUES (?);", [n]);
      } catch {}
    }
  }
}

export async function fetchRestaurants() {
  const dbi = await getDB();
  const rows = await dbi.getAllAsync("SELECT id, name FROM restaurants ORDER BY name ASC;");
  return rows ?? [];
}
