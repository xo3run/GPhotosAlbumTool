# Photo Shortlist

A small Chrome/Edge extension for reviewing Google Photos albums at full size. Keep the photos you like, return to the album grid, and select them together. You choose **Add to album** in Google Photos yourself.

**Preview:** users are testing the extension in Google Photos; automated checks use simulated pages. The DOM adapter handles hover-hidden controls and base-relative links, and offers a read-only layout report for unfamiliar layouts. Version 0.1.3 uses Chrome’s shortcut system for keeping photos, leaving Google Photos’ K navigation intact. Confirm the current layout and shortcut binding in your browser. The extension stops when it cannot identify or confirm a supported selection control.

## Install without the Chrome Web Store

No Google Cloud project, API key, sign-in flow, or build step is needed.

1. Download [photo-shortlist-0.1.4.zip](downloads/photo-shortlist-0.1.4.zip?raw=true) and unzip it into a permanent local folder. You can also use the repository’s `extension/` folder directly.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Refresh any already-open Google Photos tabs. Open one of your albums.

After changing the extension’s code, click **Reload** on its extension card and refresh Google Photos again. Keep the folder in place while the extension is installed.

**Updating an existing installation:** extract the new ZIP over the files in your existing extension folder, keeping that folder’s location the same. Click **Reload** on its extension card, then refresh Google Photos. This keeps your existing shortlists and avoids installing a second copy. The popup displays the loaded version; the shared-album fix is in **v0.1.1**.

## If selection fails

In v0.1.2 or newer, an error shows **Check page layout**. Hover over a photo thumbnail for a moment, click that button, then **Copy layout report** and share the report with the developer. If copying is blocked, the report is selected so you can use Ctrl+C (Command+C on Mac).

The report contains counts, recognized HTML roles, allowlisted attribute names, and a sanitized snapshot of hover-only controls. It excludes photo/album identifiers, URLs, access keys, captions, filenames, raw HTML, and arbitrary attribute values. It is not saved or sent automatically, and generating it does not click anything or change your shortlist. A screenshot alone does not expose the DOM structure needed to fix an unfamiliar layout.

## Use it

1. Open an album or shared album, then open a photo full-size.
2. Click **Keep photo** or press **Alt+Shift+S** (Option+Shift+S on Mac) to toggle that photo in your shortlist. Use Google Photos’ arrow navigation to continue reviewing; K retains its native backward navigation. Merely viewing a photo never keeps it.
3. Return to the album grid. Clear any existing Google Photos selection, then click **Select kept photos**.
4. Wait while the extension scrolls through the album and confirms each selection. Use **Stop selecting** to cancel.
5. Check Google Photos’ selection count, click its **Add to album** control, and choose the destination.

The original photos remain in their source album. The extension never clicks Add to album, creates an album, uploads a photo, or deletes anything from Google Photos.

**Review shortlist** lets you reopen or remove kept photos. **Clear** affects only the saved shortlist and provides **Undo clear**; it does not clear Google Photos’ native selection. After adding to your destination, clear the shortlist yourself if you are finished with it.

The panel starts in the **bottom-left** corner to leave Google Photos’ information sidebar clear. Change **Panel position** under **How it works** to use the bottom-right instead; your choice is saved for this browser. Keep/unkeep confirmations use the existing hint area so the button stays in place for a second click.

The keep shortcut is active only in the full-size album viewer while the panel is expanded. It is ignored while editing a caption, comment, or other text field, and works when a native navigation button retains focus. You can disable the keep action under **How it works**. Collapse the panel to keep it out of the way; reopen it using its compact button or the extension’s toolbar popup.

**Change or remove the shortcut:** open `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`), find **Photo Shortlist**, and edit **Keep or unkeep the current photo**. Chrome handles the binding before webpage keyboard handlers. The panel and popup show the actual binding; return to the Photos tab or refresh it after a change. If no key is assigned, the UI asks you to assign one and the Keep photo button still works. To release the key combination completely, remove it in Chrome’s shortcut settings.

## Supported scope and limitations

- Desktop Chrome/Edge, regular album URLs such as `/album/…` and `/u/1/album/…`, plus shared `/share/…` links, including direct photo links with an access key. The main photo feed, mobile browsers, and standalone `/photo/…` views are not supported in this preview.
- Shared-album review works independently of whether that Google Photos view offers native selection controls. Applying the shortlist requires those controls; if the shared view does not expose them, the extension reports that limitation. Open the album from your own library if selection is available there. The extension does not join albums or copy shared photos into your library.
- The English Google Photos interface is recommended. Semantic checkboxes work without translating their labels, but fallback selection buttons and off-screen native-selection detection use English labels.
- Google Photos controls must expose a photo link or matching `data-id`, plus a readable checkbox/selection state. Unknown or ambiguous layouts require an adapter update; no guessed clicks or private API calls are used.
- A recognized control may be hidden until hover as long as its photo tile is visible and unambiguous. Selection still requires Google Photos to confirm its state. Relative thumbnail links are resolved using the browser’s actual page base URL.
- Large albums are scanned by scrolling their container, including virtualized tiles. A scan stops after three minutes. Missing photos and partial results are reported separately from success. A photo’s ID may differ between real viewer/grid versions; that compatibility is **not yet verified on a live account**.
- Stopping a scan or encountering a failure leaves any photos already selected in Google Photos selected. Clear that native selection before retrying. The saved shortlist remains intact.
- Shortlists are separate for each album and Google account **slot** (for example `/u/0` versus `/u/1`). A slot is not a verified account identity and can change after sign-out/account reordering. Check the account before resuming a shortlist.

## Privacy and permissions

Only the `storage` permission and a content script for `https://photos.google.com/*` are requested. The extension stores album/photo identifiers, short accessible descriptions, timestamps, and preferences in `chrome.storage.local` in your browser profile. It has no backend, analytics, external dependencies, OAuth credentials, cookie access, or remote executable code. It does not store image URLs, image files, your email address, or share-link access keys. A shared album’s current access key is used only in the live page to reopen kept photos.

This enhances the Google Photos **website**. It does not bypass or gain broader permissions from the Google Photos API. It is an independent project and is not affiliated with Google.

## Develop and test

Node.js 22+ is needed only for tests; the extension itself has no runtime packages.

```sh
npm ci
npm test
npm run package
```

Browser tests use system Chromium when available at `/usr/bin/chromium`; otherwise install Playwright Chromium with `npx playwright install chromium`. Set `SHORTLIST_CHROMIUM_PATH` if a different browser executable is needed. `npm run package` also needs Python 3 and updates the zip in `downloads/`, containing **only** the extension files, with `manifest.json` at its root.

The cloud browser blocks unpacked extension installation through a managed policy. The browser suite therefore runs the **actual packaged content scripts** on intercepted, simulated Photos pages, with a Chrome API bridge and the **actual storage worker code** in a VM. The fixtures exercise full-size navigation, native K navigation, simulated browser-command delivery, remapped/unassigned shortcuts, shared-album deep links with synthetic access keys, persistence, multiple tabs/accounts/albums, virtualized grids, hover-hidden controls, relative links, diagnostic privacy, cancellation, unsupported controls, partial selection, and light/dark accessible UI. They do **not** validate Chrome’s extension loader, actual browser shortcut registration, content-script isolated worlds, or the live Google Photos DOM. No tests access a real photo account.

See [UI decisions](docs/UI.md), the [manual integration checklist](docs/MANUAL_TEST.md), and the [original project brief](docs/PROJECT_BRIEF.md).

## Credits

Created by kutsin@gmail.com. Built with assistance from ChatGPT Codex.
