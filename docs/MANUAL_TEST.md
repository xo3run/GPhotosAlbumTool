# Check the real Google Photos integration

Use an album you own with a few photos before testing a large album. This checklist is outstanding until run in a normal browser; the cloud browser's managed policy blocks installing unpacked extensions.

1. Load `extension/` unpacked in desktop Chrome or Edge. Confirm no errors on its extension card. Refresh Google Photos and open a regular album.
2. Confirm the panel appears in the grid and disappears on the main photo feed and shared `/share/…` pages.
3. Open a photo full-size. Keep it, move to another photo with the native arrow keys, and confirm simply viewing the second photo does not keep it. Keep a second photo with K, then toggle it off and on again.
4. Confirm K does not intercept typing in a caption/comment field. Disable the shortcut in How it works and confirm the button still works. Check Tab navigation, visible focus, and the collapsed panel.
5. Refresh the viewer. Confirm the shortlist survives. Review its links and verify they reopen the same original photos. Open another album and confirm its shortlist is separate.
6. Return to the grid with **no existing native selection**. Select kept photos. Check both the extension’s result and Google Photos’ selection count; visually confirm the selected tiles are the photos you kept. If no controls can be recognized, save the error text and report the browser version and interface language. Do not share cookies, tokens, or private photo URLs.
7. Manually choose Google Photos’ Add to album and select a test destination. Confirm the expected photos are there and the source album is unchanged.
8. Test an album with enough photos for Google Photos to virtualize thumbnails. Keep photos near the beginning, middle, and end. Confirm all three select correctly, without extras.
9. Start a larger scan and stop it. Confirm no further photos become selected. Clear the native selection and retry.
10. Test a missing photo (keep a photo, then remove it from the source album through Google Photos). Confirm the extension reports a partial result and does not claim all photos were selected.
11. With an unrelated photo already selected, including one scrolled out of view, confirm the extension asks you to clear Google Photos’ selection before proceeding.
12. Clear the local shortlist, undo it, and confirm neither operation changes Google Photos’ native selection. Clear it again after completing the destination album.

If viewer IDs and tile IDs differ, or controls are not exposed in a supported shape, the DOM adapter needs a code change. Do not work around this with guessed selectors, session extraction, or undocumented Google API requests.
