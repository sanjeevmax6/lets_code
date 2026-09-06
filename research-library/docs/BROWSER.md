# Chrome reading companion

The extension uses Chrome's side panel and a local native messaging host. It reads cached metadata; it does not call an AI service. User-triggered Save to queue sends only the active URL to local intake.

## Install on this Mac

The host installer has been run for the initial build. On a new checkout or after moving this directory:

```sh
python3 scripts/install-browser-host.py
```

Then in your regular Chrome:

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select this project's `extension/` folder.
3. Pin **Research Library**, open a saved article, click the extension icon, then **Find this page**.

The manifest has a stable public key. Expected extension ID: `dgkanemkmkknancnkdfammgbpppkpaho`. The native host is restricted to this ID. There is no private signing key in the project.

Use **Highlight evidence on page** to mark exact saved quotations. Ambiguous or unmatched quotations remain in the panel. Different DOM layouts, changed text, X, and Chrome's PDF viewer can prevent in-page highlighting; the panel and Obsidian source links remain the fallback. No fuzzy quote matching is used.

The extension requests active-tab access when you invoke it. It does not continuously inspect browsing history. If you switch articles, click the extension icon and Find this page again. Related links use normal HTTP(S) URLs. Source notes open through Obsidian's URL handler.

## Troubleshooting

- Host not found: rerun the installer, confirm the expected extension ID, and reload the extension.
- Library moved: rerun the installer to update its absolute executable path.
- Source not found: enqueue it, then have your agent run the complete workflow. URL tracking parameters are normalized conservatively.
- Pending analysis: `library run` prepares packets; the agent must read and submit them.
- macOS app prompt: open `apps/Obsidian.app` once and open `vault/` as a vault.

To uninstall the bridge, delete `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.research_library.reader.json` and remove the extension in Chrome. This does not delete your library.
