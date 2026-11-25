# Test report — Snapleaf 0.1.0

Date: 2026-11-23

## Environment

- Windows 11 x64
- Node.js 24.15.0, npm 11.12.1
- Electron 45.4.1
- REA 6.7.0 + Ghidra 12.1.4 / JDK 21 (analysis environment, not a runtime dependency)
- Lightshot 5.5.0.7 was closed during the clean capture test and restarted afterward.

## Static checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (main, preload, shared, renderer) |
| `npm test` | 4 files, 18 tests pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run build` | Pass |
| `npm run dist` | Pass; NSIS installer produced |

## End-to-end (development build)

`node scripts/e2e.mjs` — 0 renderer errors.

Verified:

- Home dashboard renders.
- Region capture overlay opens with the hint, selection size, eight square resize handles,
  a default Move hand, and the inline tool rail plus bottom action bar.
- Rectangle, ellipse, and freehand-lasso selection modes all open the inline editor.
- Inline arrow, Pen (single click and freehand drag), text, numbered steps, pixelate,
  per-object eraser, Clear all markup, and undo work while the selector is still on screen.
- Inline numbered steps: added 2 (markup count 5 → 7), erased only step 1 (→ 6), then
  undo restored it (→ 7) without disturbing the other step or earlier markup.
- Full editor numbered steps: added 2 (2 → 4 markups), erased one (→ 3), undo restored it
  (→ 4). Erasing the text annotation likewise removed exactly one item (5 → 4).
- Inline text accepts a multi-character string without losing focus or truncating
  (`"Inline note"`); the full editor does the same (`"Looks good!"`).
- Inline **Share** uploads the annotated crop and opens the share window directly.
- Inline **Edit** carries the marked-up crop into the full editor, which then adds further
  markup, saves, copies, and shares.
- Edge layout test: near the bottom-right corner the tool rail flips left and the action
  bar flips above, with both fitting inside the display.
- Selection editing: all four corners and all four edge midpoints expose the matching
  resize cursor; dragging inside the selection moves it (verified 60×40px); east/west
  edges resize width, north/south edges resize height, and corners resize both axes.
- Inline Save writes the annotated crop to the chosen file and passes the live capture
  overlay as the native dialog's parent window.
- Toolbar is 20px thin, icon-only, square, with 4px visual gaps and no outer padding.
- Active tool, primary action, active swatch ring, app mark, icon, and theme accents render
  in `#1E90FF`; no green brand/accent colors remain.
- Pen, text, box, line, ellipse, and arrow annotations are solid single-color strokes with
  no white/dark outline or halo; the on-screen selection border remains a dotted UI pair.
- Inline **Edit** hands the flattened marked-up crop to the full editor at native resolution.
- Ellipse capture (530×340) and lasso capture (440×360) preserve transparency: sampled
  corner alpha is 0 and centre alpha is 255 in the full editor.
- Full editor shows a checkerboard behind those transparent corners; arrow, text, steps,
  and pixelate annotations render; markup count reaches 5.
- Undo and redo work, including undoing an individual eraser removal.
- Save writes a PNG through the native save flow.
- Copy places `image/png` on the clipboard.
- Share stores the upload and opens the share window.
- Share page contains Open Graph metadata and a working gallery HTML page.
- Direct link and page link copy to the clipboard.
- Theme changes persist through settings auto-save.
- Shortcut/status UI renders correctly.
- Shortcut recorder: pressing Change enters listening mode, suspends Snapleaf's global
  shortcuts, records PrintScreen as `PrtSc` without opening a capture overlay, previews
  modifier-only input as `Shift + …`, and Escape cancels cleanly.
- Developer section renders developer profile, 4 services, and 4 references from product
  managers/product owner/project manager.
- Update flow against a local manifest advertising `9.9.9`: on-load prompt opens with
  Download / Remind me later / Skip this version; Remind stores a future timestamp; manual
  re-check shows the prompt again; Skip persists `9.9.9`.
- Crop applies and changes the dimensions (660×336 → 422×215 in the run).
- Gallery renders captures and shared links; footer path switches by tab.

Artifacts: `analysis/e2e-*.png` (local only, git-ignored).

## End-to-end (packaged build)

`node scripts/e2e-packaged.mjs` — 0 renderer errors.

Verified from `dist/win-unpacked/Snapleaf.exe`:

- App launches as `Snapleaf`, version `0.2.0`, packaged `true`.
- asar/preload/renderer paths work.
- The packaged `updates.status()` API reports current version `0.2.0`.
- The packaged Developer section renders the profile and references.
- The packaged shortcut recorder records PrintScreen without starting a capture.
- Capture overlay opens.
- Inline Pen freehand drag works without the previous one-point crash.
- Inline text accepts the full `"Packaged note"` string.
- Inline numbered steps: added 2 (markup count 2 → 4), erased one (→ 3), undo restored
  it (→ 4).
- Editor opens with the marked-up captured image, including both numbered steps.
- No renderer console errors.
- Packaged app icon, window icon, and tray icon use the blue Snapleaf mark.

## Re-verification of the installed 0.2.x builds (2026-11-24)

The reports above describe the 0.1.0 build. The selection-editing work (eight resize
handles, drag-to-move hand, stable dialog parent for inline Save) landed afterwards, so
the 0.2.0 installer was rebuilt, installed over `C:\Program Files\Snapleaf`, and verified
against the installed executable rather than the repo build:

- `npm run typecheck` and `npm run build` clean; `npm test` 18/18 passing.
- `node scripts/e2e.mjs` — 0 errors. All eight handle cursors match
  (`nw/ne/sw/se` diagonal, `n/s` vertical, `e/w` horizontal), dragging inside the
  selection moves it by the exact delta, east/west walls resize width, north/south walls
  resize height, corners resize both axes, and inline Save writes the crop with a live
  dialog parent.
- `node scripts/e2e-packaged.mjs` — 0 errors, reports version `0.2.0`, packaged `true`.
- Installed app (`C:\Program Files\Snapleaf\Snapleaf.exe`, version `0.2.0`) re-checked
  directly: eight handle cursors confirmed, drag-to-move `+60/+40 px`, right wall
  680 → 750 px wide, bottom wall 360 → 405 px tall, Save button wrote a 79,639-byte PNG,
  0 renderer errors.

### Toolbar consistency pass (0.2.1)

The top-left selection switcher was a rounded, padded pill with a "Select" caption and
text labels ("Rectangle", "Circle", "Freehand") plus a size badge, so it did not match the
icon-only rail and action bar. It is now the same square 20px strip: three 20×20 icon
buttons, square corners, `#EEF1F4` surface, `#1E90FF` active square, no text. The size
readout moved into the centre hint pill.

Asserted in `scripts/e2e.mjs` (fails the suite on regression): 3 shape buttons, each
20×20, strip 20px tall, empty `textContent`, square corners, and button heights equal to
both `.inline-tool` and `.inline-action`. Verified again against the installed 0.2.1
executable — strip `60×20` at the selection's left edge, 3 buttons of `20×20`, no text,
`border-radius: 0`, `rgb(238, 241, 244)`, with the eight handle cursors, `+60/+40 px`
drag-to-move, 680 → 750 px wall resize, and a 73,373-byte Save still passing.

Both e2e harnesses now drop an inherited `ELECTRON_RUN_AS_NODE` before launching Electron
(IDE and agent shells export it, which makes the binary run as plain Node and exit), and
the packaged harness passes its own `--user-data-dir` so a running installed copy cannot
hold the single-instance lock.

## Installer

`dist/Snapleaf-0.2.1-Setup.exe`

SHA-256:

```
771AB21046D946B53F98A9236A27D4CDD0B88BB054D6296F6C2E5FC038551CE7
```

Size: 124,142,881 bytes (approximately 124 MB). Unsigned; Windows SmartScreen may warn
until a code-signing certificate is configured.

Earlier builds, both superseded: `dist/Snapleaf-0.2.0-Setup.exe` (SHA-256
`3756673D98625D659A73949C20124FF5D4D7EF8C74ACDF82202FBE0F3C0A8040`) and
`dist/Snapleaf-0.1.0-Setup.exe` (SHA-256
`F1A774997ABE21396636964CCD307CAB33690E4082705EBFCAE76A9FF5DE3B93`).

## Caveats not covered by automation

- Native print dialog and actual printer output.
- Tray menu interactions.
- Windows Firewall prompts for LAN sharing.
- Mixed-DPI / cross-monitor selection.
- Pasting or dragging images into the editor (not implemented).
- Full-screen quick actions with the synthetic cursor (known gap).
