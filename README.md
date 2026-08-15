# Draft War Room v42 Full Revert + Integrated Changes

This is a full replacement package. No manual patching is required.

## What changed vs the broken v41 view
- Restored the complete standalone site package with one integrated `app.js` and `styles.css`.
- No separate patch script is required.
- Added a view-restoration CSS layer for desktop and mobile layout stability.

## Features included
- Excel-backed player data from `excel-seed-v41.json`.
- Admin/guest login.
- Admin username is not case-sensitive.
- Admin password remains case-sensitive: `tqsd26`.
- Guest password remains case-sensitive: `password`.
- Admin can edit ranks, tiers, draft actions, and save to Supabase/local storage.
- Guest view is read-only.
- Sleeper Picks button.
- Sleeper Picks include Excel sleeper tab, added sleepers, and manual sleeper stars.
- Edit Rankings includes predictive search and jump-to-player.
- Edit Rankings rows include a star button to add/remove manual sleepers.

## Upload
Replace your GitHub folder with the contents of this ZIP.
