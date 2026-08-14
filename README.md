# Fantasy Draft War Room 2026 + Supabase

This version uses GitHub Pages for hosting and Supabase for shared persistence.

## Files
- `index.html` - site shell
- `styles.css` - full-width layout with controls on top
- `app.js` - draft board app logic, Supabase sync, realtime updates, CSV import/export
- `config.js` - paste your Supabase URL and publishable/anon key here
- `supabase_schema.sql` - run this in Supabase SQL Editor
- `data/seed-rankings.json` - starter board
- `sample_import.csv` - CSV import template

## Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase_schema.sql`.
3. In Supabase, make sure realtime is enabled for `fantasy_players`. The SQL file includes the publication command.
4. Open `config.js` and replace:
   - `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
   - `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE`
5. Upload all files to GitHub repo root.
6. Turn on GitHub Pages from Settings > Pages.
7. Open the site and select `Seed Supabase` once to publish the starter board.

## Important security note
The SQL policies are intentionally public so your draft room can be edited by anyone who has the link. If you want private editing, add Supabase Auth and change the policies to authenticated users only.

## Editing
- Inline edit Custom Ranking and Tier directly in the table.
- Select Edit for full player edits.
- All edits save to Supabase when configured.
- Other users see updates through Supabase realtime.
