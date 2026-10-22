# GPhotosAlbumTool

A small Chrome/Edge extension for selecting a subset of an existing Google Photos
album and adding it to another album using Google Photos' own controls.

## Install

1. Download this repository to a folder.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and choose the repository folder containing `manifest.json`.
4. Open an album at `https://photos.google.com/album/...` (account-prefixed
   `/u/0/album/...` URLs also work), then click the extension in the browser toolbar.

## Create a subset

1. Scroll to load the photos you want to work with. Open the tools and click
   **Refresh count** after loading more.
2. Enter inclusive **From** and **To** positions in the loaded photos' page order.
   Set **Every** to `1` for a continuous range, or e.g. `3` for every third photo,
   starting at **From**. Click **Select range**.
3. Alternatively, **Select loaded**, **Invert loaded**, or **Clear loaded**.
   Range selection replaces the selection of loaded photos, including deselecting
   loaded photos outside the range. Offscreen/unloaded selections are not cleared.
4. Review the selection and Google Photos' **total** selected count. Use its native
   **+ / Add to → Album** action to choose an existing album or create a new one.
   The originals remain in the source album; nothing is moved or deleted.

Keep the page still while applying a selection. **Stop** cancels further changes,
but does not undo changes already made. Close and reopen the tools after navigating
to another album.

### Limitations and privacy

- This is a **loaded-photo** tool, not a whole-album scanner. Google Photos
  virtualizes large albums, so positions are not guaranteed to be album-wide.
- Google Photos' page structure is not a public API and may change. If no supported
  photo controls are found, or a selection cannot be confirmed, the tool stops.
  Shared-link views and the main photo library are not supported.
- Album creation and copying are intentionally left to Google's native UI.
  Google's Library API no longer provides general access to existing user albums
  ([API changes](https://developers.google.com/photos/support/updates)).
- There is no server, OAuth setup, analytics, or data storage. The extension uses
  `activeTab` and `scripting` only after a toolbar click, and only injects tools on
  Google Photos album pages. It does not download or upload your photos.

## Development

No dependencies or build step. With Node.js 18 or newer:

```sh
npm test
npm run check
```

For a live smoke test, load the unpacked extension and use a disposable album:
select a range, try every second photo, invert and clear, then add a small selection
to a new album with Google's controls. Confirm the source album is unchanged.
Automated tests cover selection rules; they do not prove compatibility with the
current, signed-in Google Photos UI.
