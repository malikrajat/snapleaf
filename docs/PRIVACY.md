# Privacy and security

## Default posture

Snapleaf is local-first. It does not contain analytics, advertising SDKs, accounts, or a
vendor cloud client. Screenshots and settings stay under `%APPDATA%\Snapleaf` unless you
choose to share one.

## What leaves the computer

Nothing, until you press **Share** and the built-in server is running. A share creates a
link on your LAN:

```
http://<your-lan-ip>:38473/p/<id>
```

- Anyone who can reach that address while the app is running can view the image.
- The share page and direct image are public on the bound interface (default `0.0.0.0`).
- Upload and delete APIs are separate:
  - `POST /api/upload` accepts image bodies from the network.
  - `DELETE /api/images/:id` is restricted to loopback.
- There is no per-link password or expiry yet.

To stop sharing: turn off **Settings → Sharing → Run a local image server** or quit the
tray app. Existing files remain in `uploads\` until deleted.

## Public links

If you set a **public base URL**, you are responsible for the proxy/tunnel, TLS, access
control, and logging in front of it. Snapleaf does not provide cloud hosting, accounts, or
link revocation at the edge. Deleting the record removes the local file; a reverse proxy
cache may still hold a copy.

## Telemetry

There is none. Unlike the analyzed Lightshot build (which carries Google Analytics
strings), Snapleaf does not send usage events, image URLs, or diagnostics anywhere.

## Logs

`%APPDATA%\Snapleaf\logs\snapleaf.log` records local startup, capture, save and upload
events, including file paths and local URLs. It is not uploaded. Delete it or use
**Settings → Advanced → Logs** to inspect the folder.

## Clipboard

Copy uses the native clipboard. The app writes a PNG image when you copy an image and
plain text when you copy a link. It does not read your clipboard unless a future paste
feature is explicitly used.

## Network permissions

- External web requests (for example a custom public base URL) use Chromium's network
  stack and honor the proxy setting.
- The local sharing server is a plain Node HTTP server and bypasses the proxy.
- Renderer permissions (camera, microphone, notifications from web content) are denied by
  default; native notifications are sent from the main process.

## Hardening ideas

- Bind the server to `127.0.0.1` unless LAN sharing is needed.
- Add link tokens/expiry and per-upload auth before exposing a tunnel.
- Add a firewall rule or use a VPN for sensitive screenshots.
- Sign the installer before public distribution; the update checker currently opens the
  release page rather than installing automatically.
