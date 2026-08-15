# Fantasy Draft War Room 2026 + Supabase

This version uses GitHub Pages for hosting and Supabase for shared persistence.

## New features added
- Controls moved to the top so the board is wider.
- `Custom Ranking` replaces `My Rank` everywhere.
- Inline editable Custom Ranking and Tier fields.
- Supabase shared save for ranks, tiers, notes, and draft status.
- Realtime updates for other users on the site.
- Consensus Rank column calculated from the imported source rankings.
- Source rankings display by player.
- Tier color bar by row.
- Positional Scarcity tiles by QB/RB/WR/TE and tier.
- Best Available recommendation engine.
- Draft Recommended button.
- Live Draft Board with pick order.
- Undo Last Pick button.
- Export JSON, CSV, Excel-compatible XLS, and Print/PDF.

## Supabase setup
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase_schema.sql`.
3. Open `config.js` and replace the placeholders with your Supabase Project URL and Publishable or anon key.
4. Upload all files to your GitHub repo root.
5. Enable GitHub Pages from Settings > Pages.
6. Open the site and select `Seed Supabase` once to publish the starter board.

## Important security note
The included SQL policies allow anyone with the site link to edit the board. This is intentional for shared draft-room use. If you want private editing, add Supabase Auth and change the policies to authenticated users only.

## CSV import format
Use columns:

`name, team, pos, custom_rank, tier, source, notes`

Each import source is stored in the `sources` object and contributes to the Consensus column.
