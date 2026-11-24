# Roadmap

These are the deliberate follow-ups after the verified v0.1 core.

## Editor

- Move/resize/select existing annotations (append + erase/undo today).
- Filled shapes, rounded rectangles, spotlight/dim.
- Paste from clipboard and drag-and-drop images into the editor.
- Adjustable blur vs pixelate modes; redaction strength.
- Non-rectangular crop in the full editor (capture supports ellipse/lasso).
- Multi-step crop with undo.
- Saved presets for color/width/font.

## Capture

- Cross-monitor drag selection on a single virtual canvas.
- Window/control detection and one-click window capture.
- Delayed capture (3/5/10 seconds) and repeat-last-region.
- Full-screen quick actions with the real system cursor (region captures already draw one).
- Freeze-frame animation for selecting menus and transient UI.

## Sharing

- Link expiration and one-time links.
- Upload tokens, per-link passwords, and rate limits.
- Optional S3/Cloudflare R2/Imgur adapters with explicit user configuration.
- Public landing page and custom domain support.
- Gallery bulk export and storage cleanup.

## Platform

- Signed releases and silent/delta auto-install (on-launch update prompts already exist).
- Code-signing certificate and SmartScreen reputation.
- macOS and Linux capture/tray QA.
- Portable mode.
- Localization: extract strings, ship a translation format, add RTL and CJK fonts.

## Quality

- Visual regression snapshots for overlay/editor/share pages.
- Multi-monitor and mixed-DPI CI fixtures.
- Load tests for large 8K captures and long galleries.
- Crash reporting that is opt-in and local-only.
- Accessibility audit (focus order, screen reader labels, high-contrast theme).

## Known constraints

- The local server is an intentionally small LAN service, not a hardened public host.
- PNG optimization is a Chromium re-encode, not OptiPNG/pngquant.
- Only English is shipped.
- The app is currently Windows-targeted.
