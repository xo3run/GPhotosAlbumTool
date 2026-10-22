# Photo Shortlist privacy policy

Last updated: October 22, 2026

Photo Shortlist is an independent browser extension that helps you review photos in Google Photos, save your picks, and select those photos in an album. The developer contact is kutsin@gmail.com.

## Information the extension handles

The extension runs on `https://photos.google.com/`. To provide its shortlist features, it reads the current album and photo identifiers, the Google account index shown in the page URL, album titles, short accessible photo descriptions, and native photo-selection states. The account index separates shortlists between account slots; it is not your email address or a verified account identity.

The extension saves album and photo identifiers, album titles, short photo descriptions, timestamps for kept photos, and preferences in `chrome.storage.local` in your browser profile. Preferences include the panel position, collapsed state, and whether the keep shortcut is enabled. It does not save photo files or image URLs.

A shared album's current access key is used in memory to construct links that reopen its photos. The extension does not save that key in its persistent storage, include it in layout reports, or send it to the developer. It does not read your Google password or authentication cookies.

## How information is used

Information is used to remember your picks, reopen kept photos, display the shortlist, and operate Google Photos' existing selection controls at your request. You choose the destination through Google Photos' own Add to album control. Google Photos continues to process your normal interactions under Google's own policies.

Photo Shortlist uses information accessed through Google Photos solely to provide its user-facing shortlist features, in accordance with the Chrome Web Store User Data Policy, including its Limited Use requirements. It does not use this information for advertising, profiling, credit decisions, or lending decisions.

## Transmission and sharing

Shortlist data stays in your browser profile. The extension does not automatically transmit it to the developer or third parties. The extension has no developer-operated backend, analytics, advertising, or automatic telemetry, and does not sell user data. Its executable code is included in the extension package.

If you voluntarily contact support, information you choose to include in your message is used to respond to your request.

## Optional layout reports

When you choose Check page layout, the extension generates a report containing counts, allowlisted structural metadata, the extension version, sanitized hover information, and the most recent selection attempt's stage, counts, target state, and elapsed confirmation time. Reports exclude photo and album identifiers, URLs, access keys, captions, filenames, raw page HTML, and images.

Reports and recent-attempt details are held in memory, not saved to persistent extension storage. Copy layout report places the report on your clipboard at your request. Nothing is sent automatically; you decide whether to share the copied report.

## Retention and removal

Saved shortlist data remains in the browser profile until you remove it or uninstall the extension. Remove and Clear delete saved photo choices for an album; Clear also offers a temporary Undo action in the current page. Album metadata, such as its title and identifier, and extension preferences remain after clearing photo choices. Uninstall the extension through Chrome's extension manager to remove all of its locally stored extension data.

The extension does not delete photos or change album membership when you clear a shortlist.

## Changes and contact

Changes to this policy will be published on this page with an updated date. For questions about Photo Shortlist or this policy, contact kutsin@gmail.com.
