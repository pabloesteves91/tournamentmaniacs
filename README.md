# Maniacs Pokemon TCG Tracker

Local single-device web app for running official-style Pokemon TCG tournaments.

## Features

- Player registration with optional Player ID and deck name
- Official-style presets (League Challenge, League Cup, Single Day, 2025 Championship)
- Swiss pairings with BYE handling for odd player counts
- Match points and tie-breakers (Opp Win %, Opp Opp Win %, Head-to-Head)
- Top Cut seeding with asymmetrical cuts support
- Bo1 / Bo3 result entry
- Exports: Standings and Pairings (CSV + PDF)
- Backup export/import (JSON)
- Offline-ready via service worker + manifest

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm test
npm run build
```
