# Architecture

Snapleaf uses Electron 45, React 19, TypeScript, and electron-vite.

```
main process                      preload                 renderer
------------                      -------                 --------
tray / shortcuts                  contextBridge           Home
settings store                    typed IPC API           Overlay picker
capture service  ───────────────►                         Editor canvas
library (captures + uploads)                              Gallery
local HTTP server                                         Settings
custom snapleaf:// protocol                               Share page
print / save / clipboard
```

## Capture flow

1. The tray, hotkey, or Home triggers `capture.startRegion`.
2. Main hides its visible windows, asks `desktopCapturer` for one thumbnail per display
   at that display's physical size, and creates one always-on-top overlay per display.
3. Each overlay fetches its screenshot through IPC, draws the frozen desktop, dims outside
   the selection, and provides a magnifier with sampled color and physical dimensions.
   A labeled **Select** bar switches the selection between rectangle, ellipse, and freehand
   lasso (`R`/`O`/`L`). It stays attached above the finished selection: rectangle and ellipse
   reshape the current box in place, while freehand starts a fresh lasso redraw.
4. After selection, a **thin icon-only inline editor** appears: a square tool rail attached
   flush to the selection edge, color/size popovers, undo/redo, corner resize handles, and
   a compact action bar attached to the selection. Both panes flip to the opposite side or
   above/below when the selection nears a screen edge. Annotations are stored in display CSS
   coordinates and clipped to the selection. They render as solid single-color strokes with
   no secondary outline. Numbered steps are ordinary annotations with a stable sequence
   number; the eraser removes only annotations whose geometry is hit.
5. Inline Edit, Copy, Save, Share, or Print renders the annotated crop at native
   resolution and sends one PNG data URL to main. Ellipse/lasso selections clip the bitmap,
   leaving transparent pixels outside the shape. Redraw starts a fresh selection.
   Selecting **Edit** opens the full editor with the flattened result.

## Global shortcuts

The default region-capture key is Print Screen. Windows 11 assigns that same key to
Snipping Tool by default, and `globalShortcut.register('PrintScreen')` can report success
while Windows still consumes the key. To make the default reliable, `SystemHotkeyManager`
writes the per-user `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled` value to
`0` while Snapleaf owns an enabled bare PrintScreen shortcut. The original value is kept in
`system-hotkeys.json` and restored when the takeover setting is turned off or no shortcut
uses bare PrintScreen anymore. The value stays `0` when Snapleaf exits because Windows may
only re-read it at sign-in; a one-time sign-out or restart is required after the first
change.

This takeover is limited to the documented Print Screen setting. Shell-owned combinations
such as Win+Shift+S are reserved before application hotkeys are dispatched and cannot be
registered by Electron; Snapleaf reports a registration error for those and asks the user
to choose another combination.

## Editor flow

The editor loads images as **data URLs** via IPC, not through the custom protocol, so the
canvas is not tainted and can be exported. Annotations are a small typed model
(path, shape, text, numbered step, pixel patch). A redo/undo history stores annotation
snapshots; erasing pushes the pre-erase snapshot, so undo restores just the removed item.
The canvas shows a checkerboard behind transparent pixels from ellipse/lasso captures.
Composite/export always renders at native image resolution; zoom is presentation only.

## Update checks

`UpdateService` runs in the main process so it can use `net.fetch` through the configured
proxy, survive window closes, and post a native notification. It fetches the JSON manifest
on launch (and on manual request), compares the advertised version with `app.getVersion()`,
and keeps the last result in memory for 30 minutes. The renderer subscribes to
`updates:changed` and shows the in-app prompt; the main process shows the Windows
notification on automatic checks. **Remind me later** stores a 24-hour reminder and
**Skip this version** stores the version in settings. Download opens the release page;
there is no silent installer. See [UPDATE-FEED.md](UPDATE-FEED.md).

## Storage

```
%APPDATA%\Snapleaf\
  settings.json      validated defaults + user options
  library.json       capture and upload metadata
  system-hotkeys.json remembered pre-takeover Print Screen setting
  captures\          editor/imported images
  uploads\           shared images
  logs\              local log
```

Writes use a temporary file + rename. Deleting a record verifies that the file lives under
its library directory before unlinking.

## Local sharing server

`UploadServer` is a plain Node `http` server:

| Route | Purpose |
| --- | --- |
| `GET /` | HTML gallery |
| `GET /p/:id` | Share page with Open Graph tags, download and copy |
| `GET /i/:id` | Image bytes with immutable caching |
| `POST /api/upload` | Image body upload (`image/png` or `image/jpeg`) |
| `GET /api/images` | JSON inventory |
| `DELETE /api/images/:id` | Loopback-only delete |
| `GET /health` | Liveness |

The server starts on `38473`, falls back to an ephemeral port if busy, and reports the
chosen URLs to the UI. The public base URL only changes generated links.

## Security boundaries

- `contextIsolation: true`, `nodeIntegration: false`; renderers only see the typed preload.
- Navigation and `window.open` are locked down; external URLs open in the system browser.
- Renderer web permissions are denied.
- `snapleaf://` serves only basename lookups inside `captures/` or `uploads/`.
- Upload IDs are validated; HTML is escaped; uploaded pages send CSP and `nosniff`.
- File deletion paths are checked against their owning directory.
- The built-in server has no cloud auth; see [PRIVACY.md](PRIVACY.md).

## Testing

- Vitest: settings validation, filename tokens, geometry, URL classification.
- Playwright Electron E2E (`scripts/e2e.mjs`): real rectangle/ellipse/lasso capture →
  numbered steps → per-step eraser/undo → editor → arrow/text/pixelate → clipboard image →
  upload → HTTP share page/gallery → settings/developer references → update prompt with a
  local manifest.
- TypeScript strict typecheck for main, preload, shared and renderer.
