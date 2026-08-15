# Fantasy Draft War Room 2026 + Supabase

## v9 simplified layout
- Moved only the action buttons to the top of the page.
- Search, position, show, and sort remain below Best Rec / Scarcity.
- Removed Draft Sources section entirely.
- Removed Source View dropdown, always shows all sources.
- Removed Notes column and notes editor.
- Removed all Undo controls from top toolbar and player rows.
- Show and Sort sit next to each other on mobile.
- Best Rec and Roster Scarcity are full width on mobile.


## v13 mobile alignment fix
- Built from the v9 simplified build to avoid reintroducing older changes.
- Normalized mobile panel widths so Best Rec, Roster Scarcity, Search/Filters, Draft Board, and player cards share the same left/right edges.
- Did not change HTML structure or app logic.


### v18 ranking editor
- Added Edit Rankings button at the top.
- Added a flat Excel-style ranking editor with tabs for ALL, QB, RB, WR, TE, K, and DST.
- Drag rows to reorder custom ranking slots.
- Edit Tier manually from the table.
- Saves changes back to local state and Supabase when connected.
