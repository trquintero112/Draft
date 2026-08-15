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


### v21 ranking editor drag improvements
- Added long-press drag activation on the handle only.
- Added live row movement while dragging, undo last change, and text-selection prevention on handle/rank.
- Kept scrolling available when touching non-handle areas like player/team text.


### v22 drag polish
- Fixed Undo Last Change wiring.
- Added a floating ghost tile while dragging and a gold drop line/placeholder.
- Kept live row movement while hard-pressing, with scrolling preserved outside the handle.


### v23 drag improvements
- Long-press can start from the whole player row except the tier input.
- The selected player appears as a floating ghost tile.
- A stronger gold placeholder/drop line shows exact placement.
- Haptic feedback uses navigator.vibrate when supported by the browser/device.
