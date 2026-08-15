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


### v30 Excel-only seed source
- Rebuilt seed-rankings.json and data/seed-rankings.json directly from Fantasy_Football_2026_27_Draft_Kit.xlsx, sheet All Players Ranking.
- Added a seed-source fallback map so player info popups always read FantasyPros ECR through Key Player Notes directly from the Excel-generated seed, even when Supabase/local rows are older.
- Seed Supabase now publishes the Excel file as the source of truth while preserving current custom rank, tier, drafted state, and pick values when possible.
