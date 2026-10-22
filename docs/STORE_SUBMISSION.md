# Chrome Web Store privacy form

These responses describe the packaged extension at version 0.1.6. Revisit them if the extension's permissions, data handling, or features change.

## Single purpose description

Help users choose photos from Google Photos albums by saving their picks while they review photos full-size, then selecting those photos together in the album grid so the user can add them to another album using Google Photos.

## Storage justification

Used to save the user's photo shortlist and preferences in chrome.storage.local so picks survive page reloads and browser restarts. Saved data includes album/photo identifiers, album titles, short photo descriptions, kept-photo timestamps, the account index used to separate account slots, and panel/shortcut preferences. This data stays in the user's browser and is not automatically transmitted to the developer or third parties.

## Host permission justification

Access is restricted to https://photos.google.com/*. The content script identifies the current album and photo, displays the shortlist panel, reads limited album/photo metadata, and uses Google Photos' existing selection controls to select the photos the user kept. The same features support regular and shared album pages. No access to other websites is requested.

## Remote code

Choose "No, I am not using remote code."

If an explanation is requested: All executable JavaScript and styles are included in the extension package. The extension does not download or execute remote scripts or use eval.

## Data usage

Disclose Website content: the extension reads album/photo identifiers, album titles, and short accessible photo descriptions to provide the shortlist. Handling and storage are local to the browser. It does not automatically send this information to the developer or third parties.

The other listed categories do not describe the extension's intended data handling: it does not collect identity information, health information, financial/payment information, login credentials, personal communications, location data, general browsing history, or interaction analytics.

The three certifications about selling/transferring data, using data for unrelated purposes, and creditworthiness/lending are consistent with this version's behavior.

## Privacy policy URL

https://github.com/xo3run/GPhotosAlbumTool/blob/codex/photo-shortlist-preview/docs/PRIVACY.md

Review the [privacy policy](PRIVACY.md) before using the URL in the store form.
