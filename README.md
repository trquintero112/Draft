# Fantasy Draft War Room 2026 + Supabase

## v7 cleanup
- Best recommendation and positional scarcity moved above the search/filter controls.
- Draft Board is collapsible.
- Draft Sources appears once, at the bottom, collapsed by default.
- Removed Export JSON, Export Excel, and Import Save.
- Single Import button accepts CSV source files or JSON backup files.
- Reset All Draft has two confirmation prompts and clears drafted status, drafted-by, and pick numbers while preserving rankings, tiers, notes, and sources.
- Position filters include QB, RB, WR, TE, K, and DST.
- Refresh Sources adds missing seed players such as TE/K/DST into older Supabase tables and merges source rankings.
