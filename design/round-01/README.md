# Round 01 — limits approval

The screen compared is **limits approval**, chosen because the brief calls it the product's
signature screen and because it exercises everything a direction has to get right: large money
figures, four controls with live consequences, a what-if, and an approval that has to feel like
signing rather than saving a setting.

All four carry identical content and the same four limits. Only the visual and interaction
language changes.

| | Direction | In one line |
|---|---|---|
| — | **Current** (baseline) | What ships today: rounded cards, limits read-only, no consequence shown |
| 01 | **Ledger** | Reads like a financial instrument — hairline grid, mono numerals, consequence in its own column |
| 02 | **Corridor** | A limit is a room to move in, so the room is drawn; dark and spatial |
| 03 | **Editorial** | People sign what they have read — serif sentences with the number inside, consequences as margin notes |

Open `style-explorer.html` in a browser. Candidates 01–03 are operable: drag a slider and the
consequences recalculate.

## What is shared across all three

- Pure white `#ffffff` / near-black `#0a0a0a`, one accent per direction, used only for the primary
  action and the "inside your limits" state
- 0px radii, 1px solid borders, no gradients, no shadows, no glassmorphism
- Tabular numerals on every amount
- Two typefaces at most
- 44px minimum touch targets, visible focus rings, labelled range inputs
- Verified at 1280×900 and 390×844 with no horizontal overflow

## Not yet decided

Motion, the WebGPU moment, and the remaining six surfaces wait on the direction being picked.
