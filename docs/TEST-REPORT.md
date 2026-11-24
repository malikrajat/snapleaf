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
- Region capture overlay opens with the hint, selection size, corner resize handles, and
  the new inline tool rail plus bottom action bar.
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

- App launches as `Snapleaf`, version `0.1.0`, packaged `true`.
- asar/preload/renderer paths work.
- The packaged `updates.status()` API reports current version `0.1.0`.
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

## Installer

`dist/Snapleaf-0.1.0-Setup.exe`

SHA-256:

```
F1A774997ABE21396636964CCD307CAB33690E4082705EBFCAE76A9FF5DE3B93
```

Size: 124,142,174 bytes (approximately 124 MB). Unsigned; Windows SmartScreen may warn
until a code-signing certificate is configured.

## Caveats not covered by automation

- Native print dialog and actual printer output.
- Tray menu interactions.
- Windows Firewall prompts for LAN sharing.
- Mixed-DPI / cross-monitor selection.
- Pasting or dragging images into the editor (not implemented).
- Full-screen quick actions with the synthetic cursor (known gap).
