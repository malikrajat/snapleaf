# Feature parity

Legend: **Done** = implemented and exercised; **Better** = implemented with a deliberate
UX/privacy improvement; **Partial** = present with a documented limitation; **Different** =
intentionally replaced; **Todo** = not implemented.

## Capture

| Feature | Lightshot | Snapleaf | Notes |
| --- | --- | --- | --- |
| Region selection | Done | **Better** | Rectangle, ellipse, or freehand lasso; a square icon-only shape strip above the selection, built from the same 20px parts as the tool rail and action bar, keeps the shape changeable after drawing; transparent pixels outside non-rectangular shapes; drag, size readout in the hint bar, eight square resize handles (four corners + four edges), drag-to-move hand tool, magnifier + pixel color, remembered region |
| Inline markup on selection | Done | **Better** | 20px icon-only square rail/action bar beside the selection, `#1E90FF` active states and branding, solid single-color annotations with no second outline, numbered steps, per-object eraser, color/size panels, undo/redo, smart edge flipping; markup tools are opt-in so the default drag moves the selection |
| Full-screen capture | Done | **Done** | Cursor display or primary/current display |
| Global PrintScreen | Done | **Better** | Takes the bare PrtSc key from Windows Snipping Tool through the per-user setting, restores it when disabled, and warns when Windows still owns it; Win-key shell shortcuts remain reserved |
| Multi-monitor | Done | **Partial** | Per-display overlays and DPI-aware crops; one display per selection |
| Window-under-cursor detection | Basic | **Todo** | Region drag is explicit; no automatic window bounds yet |
| Keep last selection | Done | **Done** | Stored per display |
| Include cursor | Done | **Partial** | Region captures draw a pointer; full-screen quick actions may omit it |
| Dim outside selection | Done | **Done** | Adjustable opacity |
| Magnifier | Done | **Better** | Shows physical coordinates and sampled color |
| Delay capture | Not present | **Todo** | Useful future addition |
| Drag-and-drop / paste image | Open file only | **Partial** | Open image implemented; clipboard paste is future work |

## Editor

| Feature | Lightshot | Snapleaf | Notes |
| --- | --- | --- | --- |
| Pen | Done | **Done** | Smoothed freehand |
| Line | Done | **Done** | |
| Arrow | Done | **Done** | Filled arrowhead |
| Rectangle | Done | **Done** | |
| Circle/ellipse | Done | **Done** | |
| Marker/highlighter | Done | **Done** | Translucent, thicker stroke |
| Text | Done | **Done** | Inline textarea; commit with Ctrl+Enter or blur |
| Color picker | Done | **Better** | Swatches, custom color, recent default |
| Stroke size | Done | **Better** | Slider + number + bracket shortcuts |
| Undo | Done | **Done** | 40-step history |
| Redo | Not present | **Better** | Button + Ctrl+Shift+Z/Ctrl+Y |
| Blur | Done | **Better** | Pixelation/redaction patch; arbitrary rect |
| Crop | Not present | **Better** | Drag, preview, apply; rectangular only (capture supports ellipse/lasso) |
| Zoom / fit | Not present | **Better** | Zoom controls; fit-to-window |
| Clear all markup | Not explicit | **Better** | Trash button with undo |
| Per-object eraser | Not present | **Better** | Removes one annotation or numbered step per click; undo restores only that removal |
| Step numbers/callouts | Not present | **Done** | Auto-numbered badges 1, 2, 3... in inline and full editor |
| Move/edit existing annotation | Not present | **Partial** | Eraser can delete one annotation; no move/resize yet |
| Shapes with fill | Not present | **Todo** | Outline only today |
| Inline vs full editor | Inline toolbar only | **Better** | Both: act inline immediately or press Edit for the full editor |
| Copy | Done | **Done** | PNG to clipboard (Electron 45 ClipboardItem); inline and editor |
| Save | Done | **Done** | PNG/JPEG, quality, filename pattern, folder; inline and editor, with a stable dialog parent so inline Save writes the file |
| Print | Done | **Done** | System print dialog from inline or editor |
| Upload | Done | **Different** | Built-in local server instead of prntscr.com; inline Share |
| Online editor | Vendor service | **Different** | Local editor; no round trip |

## Sharing & gallery

| Feature | Lightshot | Snapleaf | Notes |
| --- | --- | --- | --- |
| Upload service | prntscr.com | **Different** | Local server; optional public base URL via your tunnel/proxy |
| Short page link | Done | **Done** | `/p/<id>` with OG metadata |
| Direct image link | Done | **Done** | `/i/<id>` |
| QR code | Not present | **Better** | Share page window |
| Copy link after upload | Done | **Done** | Configurable |
| Auto-close upload window | Done | **Done** | 3-second countdown |
| Drag/copy link | Done | **Done** | Page + direct image |
| Twitter/X | Done | **Done** | Web intent |
| Facebook | Done | **Done** | Sharer |
| VK | Done | **Done** | Share URL |
| Pinterest | Done | **Done** | Pin create |
| Email | Done | **Done** | `mailto:` |
| Google image search | Done | **Partial** | TinEye and Google Lens intents available; results depend on public URL |
| TinEye | Done | **Done** | Share intent |
| Gallery | Account gallery | **Better** | Local searchable gallery for captures and uploads |
| Sign-in / account | Required for gallery | **Different** | No account; everything local |
| Delete upload | Vendor | **Done** | Deletes local file + record; link stops working |
| Public cloud hosting | Vendor | **Todo** | Use a reverse proxy/tunnel with the local server |

## App, options, and platform

| Feature | Lightshot | Snapleaf | Notes |
| --- | --- | --- | --- |
| Tray app | Done | **Done** | Capture, full screen, save/upload, gallery, settings, quit |
| Tray tooltip | Done | **Done** | Shows current hotkey |
| Global capture hotkey | Done | **Done** | PrintScreen default; recorder + conflict messages |
| Instant save fullscreen | Done | **Done** | Configurable, disabled by default |
| Instant upload fullscreen | Done | **Done** | Configurable, disabled by default |
| Notifications | Done | **Done** | Native notifications; toggle |
| Capture cursor | Done | **Partial** | Region only (see above) |
| Auto-copy link | Done | **Done** | |
| Auto-close upload window | Done | **Done** | |
| Upload format + JPEG quality | Done | **Done** | |
| PNG optimization | OptiPNG | **Partial** | Chromium re-encode; not a pngquant/OptiPNG pipeline |
| Proxy | Done | **Done** | System/none/manual through Electron session; local server bypasses proxy |
| Themes | Not present | **Better** | System/light/dark |
| Language selection | 54 locales | **Partial** | English UI today; language plumbing for community translations |
| Launch at login | Not in UI | **Better** | Settings toggle |
| Single instance | Done | **Done** | Second launch focuses the dashboard |
| Auto-update | Vendor updater | **Partial** | On-launch manifest check, in-app prompt + Windows notification, Remind me later / Skip this version; Download opens the release page, no silent install |
| Telemetry | Google Analytics | **Better** | None |
| Browser extension/plugin | Legacy NPAPI | **Different** | Standalone only |
| macOS/Linux | Lightshot has a Mac build | **Todo** | Electron code is cross-platform; capture/tray need platform QA |

## UX improvements over Lightshot

1. A real dashboard with a giant capture action, recent work, and onboarding.
2. **Both workflows at once**: the familiar inline tool rail/action bar during selection,
   plus a roomy full editor when needed.
3. Labeled tools and visible keyboard shortcuts instead of tiny unlabeled toolbar glyphs.
4. Inline color/size popovers, eight selection resize handles, drag-to-move hand,
   undo/redo, numbered steps, a per-object eraser, and clear-all markup.
5. Redo, crop, zoom, clear-all markup, and pixelation as first-class tools.
6. One share window with page link, direct link, QR, and share targets.
7. Searchable local gallery with separate Captures and Shared tabs that refresh live.
8. Human-readable hotkey errors and a shortcut recorder.
9. No account, no ads, no analytics, no vendor lock-in.
10. Everything is stored in a predictable `%APPDATA%\Snapleaf` tree.

## Explicit non-goals

- Reproducing Lightshot's proprietary code, icons, skins, translations, or name.
- Providing a drop-in replacement for prntscr.com accounts or hosted links.
- Circumventing vendor licensing or automating the vendor's service.

The remaining **Todo** items are tracked in [ROADMAP.md](ROADMAP.md).
