# SAC Finder AI

Static SAC code finder for task descriptions, planning comments, and task card text.

## What it does
- Keeps the original single-file HTML structure intact.
- Uses the embedded SAC database already present in `index.html`.
- Detects likely removal / inspection / access wording from the pasted text.
- Splits task-card style input into segments.
- Scores candidate SAC codes against the text.
- Returns:
  - the best SAC code,
  - closest available SAC when no exact match is found,
  - a match coefficient,
  - evidence and decision rules.

## Matching rules
1. Normalize the input text.
2. Split multi-line task card content into separate segments.
3. Detect operation wording such as remove, inspect, install, access, open, close.
4. Detect object/location hints such as door, radome, frame, lining, LH/RH, FWD/AFT.
5. Search the embedded SAC definition and mapping data.
6. Penalize mismatched zones or unrelated structures.
7. Prefer exact definition matches when available.
8. If no strong exact match exists, return the closest available SAC with a coefficient.

## Files
- `index.html` — full application, unchanged HTML structure, updated logic only.

## GitHub Pages
This repository can be published directly as a static site:
- Settings -> Pages
- Deploy from branch
- Branch: `main`
- Folder: `/ (root)`

The homepage will use `index.html` automatically.
