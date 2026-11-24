# Update feed

Snapleaf checks a small JSON manifest when it starts. If the manifest advertises a
newer version, the app shows an in-app prompt with **Download update**, **Remind me
later**, and **Skip this version**, and posts a Windows notification. Snapleaf never
downloads or installs an update silently; **Download update** opens the release page
in the default browser.

## Default location

```
https://rajatmalik.dev/snapleaf/latest.json
```

The URL can be changed under **Settings → Advanced → Application updates**. A different
feed can also be injected for testing:

```powershell
$env:SNAPLEAF_UPDATE_FEED = 'http://127.0.0.1:8123/latest.json'
```

## Manifest format

```json
{
  "version": "0.2.0",
  "downloadUrl": "https://rajatmalik.dev/snapleaf/Snapleaf-0.2.0-Setup.exe",
  "releaseUrl": "https://rajatmalik.dev/snapleaf/",
  "notes": "Numbered steps, a per-object eraser, and ellipse/lasso capture.",
  "publishedAt": "2026-12-01T10:00:00Z"
}
```

| Field | Required | Purpose |
| --- | --- | --- |
| `version` | Yes | Version being advertised, with or without a leading `v`. |
| `downloadUrl` | Yes | `http(s)` page or installer the Download button opens. |
| `releaseUrl` | No | Release page; falls back to `downloadUrl`. |
| `notes` | No | Short release notes shown in the prompt. |
| `publishedAt` | No | ISO date shown as release metadata. |

A GitHub `releases/latest` API response is also accepted: `tag_name`, `html_url`,
`body`, and `published_at` are read automatically. The download button will open the
GitHub release page.

## Behaviour

- Checks run on launch when **Check for updates when Snapleaf starts** is enabled.
- A successful check is cached for 30 minutes per feed URL.
- **Remind me later** suppresses the prompt for 24 hours.
- **Skip this version** suppresses only that version; a newer one prompts again.
- Manual checks from Settings ignore the reminder and skipped-version filters.
- The notification is skipped when **Settings → General → Notifications** is off.
- Only `http` and `https` URLs are accepted from a manifest.
- Network failures and invalid manifests are shown only in Settings, not as a popup.

## Publishing a release

1. Build the installer with `npm run dist`.
2. Upload the installer and release notes to a stable URL.
3. Upload `latest.json` next to the release (or update the feed URL in Settings).
4. Keep the manifest version higher than the installed `package.json` version.

The feed is intentionally static; no analytics or identifiers are sent with the
request beyond what the host already receives for any HTTP request.
