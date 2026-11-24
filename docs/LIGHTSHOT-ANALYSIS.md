# Lightshot analysis notes

This document records the read-only research used to build Snapleaf. It is a behavioral
and static-format study of a locally installed copy of Lightshot, not a source-code
recovery project and not a distribution of Lightshot material.

## Target

| Item | Observation |
| --- | --- |
| Product | Lightshot 5.5.0.7 (binary version 5.5.0.4) |
| Install root | `C:\Program Files (x86)\Skillbrains\lightshot` |
| Runtime folder | `C:\Program Files (x86)\Skillbrains\lightshot\5.5.0.7` |
| Installer | Inno Setup 5.5.3 (`unins000.*`) |
| Vendor | Skillbrains |
| Architecture | 32-bit x86 PE |
| Build timestamps | 2019-07-22 |
| PDB paths | `D:\Dev\skillbrains\lightshot-windows-app\Screenshot\StandAloneApp\Release\*.pdb` |

SHA-256 digests of the installed binaries:

| File | SHA-256 |
| --- | --- |
| `Lightshot.exe` (starter) | `0b899508777d7ed5159e2a99a5eff60c54d0724493df3d630525b837fa43aa51` |
| `Lightshot.dll` | `04a27f0d1e89341722461119e00a10e00ec2a52f5e305961161ec4378e610e93` |
| `net.dll` | `45b2c27a4345d789287539dd82c9f85ac9324d01825f6e2e0c2cdd4c4172c038` |
| `uploader.dll` | `037ee2f3243918fffa71b9e3fe0541245f75f89abcac0ccf2ea6a57020ddaad7` |
| `DXGIODScreenshot.dll` | `6acdcd817cc5df637aa4cd101c25c9e0a69c778347a7a40ce7511eeea26fd6f0` |

## Tools and method

- **REA 6.7.0** installed from the `rea-agents` npm package, plus a shallow recursive
  clone of `morluto/rea` for source/docs and submodules.
- **Ghidra 12.1.4** (`D:\project\light\tools\ghidra_12.1.4_PUBLIC`) with Microsoft
  OpenJDK 21. REA's `doctor --provider ghidra` reported every check healthy.
- `rea inspect-artifact` for provider-neutral artifact facts.
- `rea inspect ... --provider ghidra` for the native overview. The Windows Ghidra P0
  session imported `Lightshot.dll` and reported 1,679 procedures and 769 defined strings.
- A small read-only Python/`pefile` pass for PE headers, imports, exports, resources,
  version info, PDB paths and printable ASCII/UTF-16 strings.
- The running application, its registry settings, and the shipped English locale file
  (`locales/en.txt`) for user-visible behavior.

No Lightshot process was injected, patched, or uploaded. No request was sent to
`prntscr.com`. No Lightshot binary, icon, translation, or decompiled code is included in
Snapleaf.

## Module map

| Module | Role | Evidence |
| --- | --- | --- |
| `Lightshot.exe` (226 KB) | Starter/tray shell | "Starter Module", launches the versioned app; globals `LightshotStandAloneAppMainMutex`, `Lightshot_Tray_Wnd`; options and sign-in dialogs; hotkey registration |
| `5.5.0.7\Lightshot.exe` (500 KB) | Main app | exports `InitLightshot`, `DeinitLightshot`, `MakeScreenshot`, `MakeScreenshotByCommand`, `SetTranslations`; WTL/ATL dialogs and toolbars |
| `Lightshot.dll` (503 KB) | Capture selector, editor, share toolbar | exports the same API; GDI+ (`gdiplus.dll`, 66 imports), GDI, clipboard, screen/monitor APIs; classes `CMainDlg`, `CScreenshotToolbar`, `CEditToolbar`, `CShareToolbar`, `CSkinnedButton`, `CMyToolbar` |
| `net.dll` (533 KB) | HTTP/TLS/cookies/proxy | libcurl strings, WinINet, LDAP, Schannel/certificate strings; exports `PostExp`, `SetCustomProxyExp`, `UrlReadToString` |
| `uploader.dll` (221 KB) | Multipart image upload | exports `UploadImage`, `SetLocaleString`; `https://upload.prntscr.com/upload`; `multipart/form-data`; app tokens |
| `DXGIODScreenshot.dll` (96 KB) | Desktop Duplication capture | export `TakeScreenshotExp`; `d3d11.dll`, `dxgi.dll`, `EnumDisplayMonitors`, `GetWindowDC` |

`net.dll` carries a full libcurl build (proxy, cookies, TLS, multipart). `uploader.dll`
constructs the multipart body and talks to the upload endpoint. The presence of both
`image/png` and `image/jpeg` plus the `UploadFormat`/`JPEG quality` settings confirms
format conversion before upload.

## User-visible feature inventory

From the shipped English locale and registry options:

**Capture**
- Select an area; select full screen; clear selection; cancel; keep last selection.
- Capture cursor (optional); dim outside the selection; multi-monitor & per-monitor DPI.
- Optional instant save and instant upload full-screen hotkeys.

**Editor**
- Pen, line, arrow, rectangle, marker, text, color, undo, blur, circle.
- Copy, save, print, upload, close, open an image.
- Editor is a WTL dialog; toolbars are separate skin windows (`CScreenshotToolbar`,
  `CEditToolbar`, `CShareToolbar`).

**Sharing**
- Upload to `https://upload.prntscr.com/upload`.
- Share to Google image search, TinEye, email, Twitter, Facebook, VK, Pinterest.
- Upload progress, retry, proxy-aware failure dialogs.
- Copy link automatically; auto-close upload window.
- Sign in to prntscr.com; "My gallery" via `gallery.html#id=`.

**Options**
- General: auto-copy link, auto-close upload, notifications, capture cursor, language.
- Proxy: none / system / manual HTTP(S) proxy.
- Formats: upload format, JPEG quality.
- Hotkeys: general, instant save fullscreen, instant upload fullscreen, validation and
  duplicate checks.
- Optimize screenshots (OptiPNG): never / always / upload only.

**Other**
- Tray menu (take screenshot, options, help, exit), tray tooltip showing the hotkey.
- Native balloon notifications.
- 54 locale files (including RTL and CJK).
- Google Analytics (`__utm.gif`) and separate updater `1.8.0.0`.
- NPAPI/browser-extension legacy messages.

## Network endpoints and state observed in strings

```
https://upload.prntscr.com/upload
https://api.prntscr.com/v1.1/
https://prntscr.com/
https://app.prntscr.com/
app/attach_app.php?id=
gallery.html#id=
http://www.google-analytics.com/__utm.gif?utmwv=4.4sh
```

Tokens and keys observed: `token`, `login_token`, `app_token`, `<invalid_token`.

Registry state (current user):

```
Software\SkillBrains\Lightshot
  Locale, appFirstRun, LastSavedDir, Format, AutoCopy, AutoClose,
  ShowBubbles, KeepSelection, CaptureCursor,
  Hotkey_main_mod/vk/enabled,
  Hotkey_savefull_mod/vk/enabled,
  Hotkey_uploadfull_mod/vk/enabled,
  ProxyString, ProxyType
```

The installed profile used `Alt+PrintScreen` for the general hotkey, `Ctrl+Alt+PrintScreen`
for instant save, and instant upload disabled.

## Inference boundaries

- Observations above come from headers, imports, exports, resources, strings and the
  user-facing locale/registry. They establish capability, not exact source structure.
- The Ghidra session completed default analysis and an overview, but this project did not
  reconstruct every function. Behavior such as upload response parsing, token exchange and
  gallery sign-in is inferred from strings and module roles, not from live traffic.
- Screenshot evidence was gathered from a running copy; no remote service was contacted.
- Windows Ghidra P0 is read-only; the target bytes were never modified.

## What Snapleaf does differently

- Original code, UI, icon and English copy; no Lightshot assets or branding.
- Built-in **local** share server and gallery instead of a vendor cloud account.
- No analytics or telemetry.
- Modern editor with **redo, crop, zoom, clear markup**, and a visible labeled toolbar.
- Explicit, searchable gallery with local storage controls.
- Local-first privacy: screenshots stay on disk unless the user shares.

See [FEATURE-PARITY.md](FEATURE-PARITY.md) for the line-by-line comparison and
[REA-SETUP.md](REA-SETUP.md) for reproducing the analysis environment.
