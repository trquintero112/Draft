# Draft War Room v55 Optimized

Source workbook: Fantasy_Football_2026_27_Draft_Kit_v2.xlsx
Roster rows loaded: 220 players.
Sleeper targets loaded: 8 players.

Upload all files over the existing site folder. Keep your existing app.js, styles.css, and config.js files. This package preserves the v45 core app path and adds safe performance overlays.

Performance changes:
- Debounces high-frequency search/filter/sort input events.
- Coalesces repeated render calls into animation frames.
- Adds browser-level content visibility for offscreen rows.
- Adds a Fast Mode toggle to reduce visual overhead for faster interactions.
- Keeps Compact View and Draft Board i-style notes icon.
