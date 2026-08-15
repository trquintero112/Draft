# Fantasy Draft War Room 2026/27

## v26 Draft Kit Player Info
- Uses `Fantasy_Football_2026_27_Draft_Kit.xlsx` All Players Ranking as the base ranking source.
- Loads Consensus Rank, Consensus Tier, FantasyPros ECR, Draft Sharks 3D, Rotoworld Top 200, Avg ADP, and Key Player Notes & Analysis for all 120 players.
- Draft Board: hard-press a player tile to view source rankings and notes.
- Edit Rankings: tap the notepad button to view the same player info.
- Long-press rows in Edit Rankings to reorder custom rankings.


## v27 Supabase hydration fix
- Merges draft-kit player_info from data/seed-rankings.json into existing Supabase rows by id/name.
- Persists the merged notes JSON back to Supabase so FantasyPros ECR through Key Player Notes survive refreshes and devices.


### v32 final repair
- Rebuilt app.js cleanly so Draft Board always shows the 📝 notes icon on the player-name line.
- Removed hard-press notes behavior from Draft Board.
- Player info popup now falls back to the Excel-generated seed by player id/name, so FantasyPros ECR through Key Player Notes show even when Supabase rows are older.
- Reapplied no-text-selection behavior sitewide except for the Search bar.
- Included the supplied Supabase URL/key in config.js.


### v33 Excel seed migration supremacy
- Rebuilt seed-rankings.json and data/seed-rankings.json from the Excel All Players Ranking tab.
- On load, if Supabase/local rows are stale, the app now replaces the base ranking/tier/source/player notes with the Excel seed while preserving only drafted status, draftedBy, and pick.
- No Supabase login is required in the browser UI if the publishable key has insert/update/select permissions through RLS. The app attempts the migration automatically on load, and Seed Supabase forces it again.


### v34 Excel-only source of truth
- Added excel-seed-v34.json generated directly from Fantasy_Football_2026_27_Draft_Kit.xlsx, All Players Ranking.
- App now fetches excel-seed-v34.json directly and ignores old/local/Supabase ranking rows for rank, tier, sources, and notes.
- Supabase preserves only live draft state: drafted, draftedBy, and pick.
- On load, app attempts to push the Excel-only seed into Supabase automatically if permissions allow.


### v35 startup fix
- Removed the earlier app startup call that ran before the Excel-only overrides were defined.
- The app now starts once, after DOMContentLoaded, using the final Excel-only loading functions.
- Uses excel-seed-v34.json as the primary data file and ignores old seed/local rows for rankings/notes.


### v36 custom rank and tier persistence
- Excel remains the source for player list, source rankings, and player notes.
- Custom Rank and Tier edits now persist across refreshes using local storage and Supabase.
- Drag-and-drop ranking changes in Edit Rankings save as custom rank overrides.
- Refresh Sources keeps your custom rank and tier edits while refreshing Excel notes/source rankings.
