# Fantasy Draft War Room 2026

A static GitHub Pages fantasy football draft board built for the 2026/2027 season.

## What is included
- `index.html` - website shell
- `styles.css` - responsive dark war-room styling
- `app.js` - all draft-board logic, localStorage persistence, CSV/JSON import/export
- `data/seed-rankings.json` - starter 2026 board seeded from a public FantasyPros rankings/tier table
- `sample_import.csv` - import template for adding rankings from other sources

## Launch on GitHub Pages
1. Create a new GitHub repo.
2. Upload all files in this folder to the repo root.
3. In GitHub, go to Settings > Pages.
4. Set Source to Deploy from a branch, Branch to `main`, Folder to `/root`, then Save.
5. Open the GitHub Pages URL GitHub gives you.

## How saving works
The site is static and saves your rank edits, tier edits, notes, drafted players, and your drafted team in the browser's localStorage. It persists after refresh on the same browser/device.

## Important source note
A GitHub Pages site usually cannot automatically scrape rankings from FantasyPros, ESPN, RotoBaller, Draft Sharks, CBS/SportsLine, Footballguys, Yahoo, Sleeper, or other sites because of CORS, login/paywall, and site terms. This build solves that by letting you import CSV files from any site or your own sheet.

## CSV import format
Use columns:

`name, team, pos, rank, tier, source, notes`

Example:

`Bijan Robinson, ATL, RB, 1, 1, My Sheet, Must consider at 1.01`

## Recommended workflow
1. Import your favorite source rankings as CSV.
2. Edit ranks and tiers as your final board.
3. During the draft, mark players as `Mine` or `Gone`.
4. Export Save after the draft or between devices.
