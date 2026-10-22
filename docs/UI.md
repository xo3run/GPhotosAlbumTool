# UI decisions

The workflow is deliberately contextual: Google Photos continues to display and navigate photos. Photo Shortlist adds one toggle during review and one selection action in the album grid. The final destination action stays in Google Photos.

- **Small, collapsible panel.** A 336 px panel in the lower-right corner avoids taking over the page. It collapses to a count and can be reopened from the toolbar popup. The panel has its own scroll region on short screens.
- **Stable toggle semantics.** Keep photo retains its label and uses `aria-pressed`, a checkmark, and a color change. A kept state is not communicated by color alone.
- **Visible progress and honest feedback.** The panel shows a saved count, native-selection progress, a Stop control, and distinct complete/partial/error messages. A dispatched click does not count as a confirmed selection.
- **Keyboard and focus.** Native buttons, links, a disclosure, and checkbox preferences support keyboard operation. Focus rings are visible. The character shortcut can be disabled, does not run while typing, and does not silently keep photos when the panel is collapsed. Google Photos retains arrow navigation.
- **Readable, restrained styling.** System fonts, neutral surfaces, one green accent, light/dark themes, and text labels accompany icons. No animations are required; reduced-motion and forced-colors preferences are respected.
- **Reversible actions.** Clear only changes the local shortlist and provides Undo. Native selections are left visible after a stopped scan. Existing selections must be cleared before applying a shortlist.
- **Isolated presentation.** A shadow root prevents most styling collisions with Google Photos. UI strings read from the page are inserted using `textContent`; photo links are reconstructed from validated identifiers.
- **Minimal access.** A single-site content script and local storage; no all-sites permission, tabs permission, cookies, private Google endpoints, remote scripts, or photo uploads.

Automated axe checks cover WCAG A/AA rules for the dock and popup. Fixture screenshots cover album, full-size review, dark theme, and narrow layout. Keyboard behavior is exercised separately. This is useful automated coverage, not a claim of complete accessibility conformance or real Photos compatibility.

## Guidance consulted

- [Chrome: Design the user interface](https://developer.chrome.com/docs/extensions/develop/ui) — purposeful, minimal UI and contextual extension actions. The official [Chrome documentation source](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/user_interface/index.md) was accessible from this environment.
- [Chrome: Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) — request narrowly scoped permissions. Consulted through the [official source](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/declare_permissions/index.md).
- [MDN: aria-pressed](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed) — stable labels and toggle state, consulted through [MDN’s source](https://github.com/mdn/content/blob/main/files/en-us/web/accessibility/aria/reference/attributes/aria-pressed/index.md).
