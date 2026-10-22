/* Google Photos DOM integration lives here. Fail closed when a control is ambiguous. */
(() => {
  "use strict";
  const Core = globalThis.PhotoShortlist;
  const CONTROLS = 'input[type="checkbox"], [role="checkbox"], button[aria-label], [role="button"][aria-label]';
  let lastAttempt = null;
  const itemState = (item) => !item ? "unavailable" : selectionState(item.control) === true ? "selected" : selectionState(item.control) === false ? "unselected" : "unavailable";
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Stopped", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Stopped", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
  const displayed = (element) => element.isConnected && element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]');

  function visibleIndicator(element) {
    if (!displayed(element) || element.closest('[inert]') || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    // A retained toolbar can have layout boxes while translated out of view
    // or clipped by a collapsed container. Neither proves an active selection.
    for (let parent = element.parentElement; parent && right > left && bottom > top; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const clipX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
      const clipY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
      if (!clipX && !clipY) continue;
      const bounds = parent.getBoundingClientRect();
      if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return right > left && bottom > top;
  }

  function selectionState(control) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
    const checked = control.getAttribute("aria-checked");
    if (checked === "true" || checked === "false") return checked === "true";
    // Some Photos versions use labeled buttons instead of semantic checkboxes.
    const label = (control.getAttribute("aria-label") || "").trim();
    if (/^(deselect|unselect)( (photo|video|item))?$/i.test(label)) return true;
    if (/^select( (photo|video|item))?$/i.test(label)) return false;
    return null;
  }

  function photoIdFromLink(link, route) {
    const parsed = Core.parseRoute(link.href);
    if (!parsed?.photoId || parsed.account !== route.account) return null;
    return !parsed.albumId || parsed.albumId === route.albumId ? parsed.photoId : null;
  }

  function findControl(link, route) {
    let card = link;
    for (let depth = 0; card && card !== document.body && depth < 6; depth++, card = card.parentElement) {
      const ids = new Set([...card.querySelectorAll('a[href]')].map((a) => photoIdFromLink(a, route)).filter(Boolean));
      if (ids.size > 1) return null;
      // Photos can keep its checkmark control display:none until the tile is
      // hovered. The enclosing photo must be visible; the identified native
      // control can be hidden, and its state is still verified after clicking.
      const controls = [...card.querySelectorAll(CONTROLS)].filter((element) => selectionState(element) !== null);
      if (controls.length === 1) return { card, control: controls[0] };
      if (controls.length > 1) return null;
    }
    return null;
  }

  function gridItems(route) {
    const items = new Map();
    for (const link of document.querySelectorAll('a[href]')) {
      if (!displayed(link)) continue;
      const id = photoIdFromLink(link, route);
      if (!id) continue;
      const item = findControl(link, route);
      if (item && !items.has(id)) items.set(id, { ...item, link, id });
    }
    // Fallback for versions whose tiles expose an ID, but no photo link.
    for (const card of document.querySelectorAll("[data-id]")) {
      const id = card.getAttribute("data-id");
      if (!Core.validId(id) || items.has(id) || !displayed(card)) continue;
      if (card.querySelectorAll("[data-id]").length) continue;
      const controls = [...card.querySelectorAll(CONTROLS)].filter((control) => selectionState(control) !== null);
      if (controls.length === 1) items.set(id, { card, control: controls[0], id });
    }
    return items;
  }

  function scrollContainer(items) {
    const first = items.values().next().value?.card;
    for (let node = first?.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    }
    return document.scrollingElement;
  }

  function describePhoto() {
    const images = [...document.images].filter((image) => displayed(image));
    images.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return Core.cleanLabel(images[0]?.alt) || "Photo";
  }

  function albumTitle() {
    return Core.cleanLabel(document.querySelector('main h1, [role="main"] h1, h1')?.textContent)
      || Core.cleanLabel(document.title.replace(/\s*[-–|]\s*Google Photos\s*$/i, "").replace(/^Google Photos$/i, ""))
      || "This album";
  }

  function selectionIndicators(items) {
    return {
      // Only identified photo controls count, not unrelated checked preferences.
      // Keep reading these even when hover-only controls or tiles are offscreen.
      selectedPhotos: [...items.values()].filter((item) => selectionState(item.control) === true).length,
      // A selected tile may be virtualized away; an active toolbar still blocks
      // mixing selections. Inactive retained toolbars must actually be visible.
      visibleClearControls: [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')].filter((button) => /^(clear selection|cancel selection|deselect all|unselect all)$/i.test(button.getAttribute("aria-label").trim()) && visibleIndicator(button)).length,
      visibleSelectedCounts: [...document.querySelectorAll('header span, [role="toolbar"] span, [aria-live]')].filter((element) => /^\s*[1-9][\d,]*\s+(?:items?\s+)?selected\s*$/i.test(element.textContent) && visibleIndicator(element)).length,
    };
  }

  async function selectKept(route, ids, { signal, onProgress = () => {} } = {}) {
    const wanted = new Set(ids);
    const confirmed = new Set();
    const initialPath = location.pathname + location.search;
    const started = Date.now();
    let scroller;
    let initialScroll = 0;
    let bottomPasses = 0;
    let scanned = 0;
    // Keep only safe counts and enums for an optional layout report. No IDs,
    // links, labels, or page text are retained in the attempt diagnostics.
    lastAttempt = { status: "running", stage: "checking", total: wanted.size, confirmed: 0, targetState: "none", waitedMs: 0 };
    const guard = () => {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      if (location.pathname + location.search !== initialPath || Core.parseRoute(location.href)?.kind !== "album") throw new DOMException("The page changed", "AbortError");
      if (Date.now() - started > 180000) throw new Error("The scan timed out. Clear Google Photos’ current selection before retrying; your shortlist is saved.");
    };
    try {
      guard();
      let items = gridItems(route);
      if (!items.size) throw new Error(route.albumType === "share"
        ? "No supported photo selection controls found in this shared view. Open the album from your Google Photos library if it offers selection there, or report this layout for an extension update. Your shortlist is saved."
        : "No supported photo selection controls found. Open the album grid and retry. This Google Photos layout may need an extension update.");
      if (Object.values(selectionIndicators(items)).some((count) => count > 0)) throw new Error("Clear Google Photos’ existing selection first, then retry. Your shortlist is saved.");
      scroller = scrollContainer(items);
      initialScroll = scroller.scrollTop;
      scroller.scrollTo({ top: 0, behavior: "instant" });
      await sleep(250, signal);
      while (confirmed.size < wanted.size) {
        guard();
        lastAttempt.stage = "scanning";
        items = gridItems(route);
        for (const id of items.keys()) {
          if (!wanted.has(id) || confirmed.has(id)) continue;
          guard();
          // Each click or scroll can replace the grid. Never reuse a control
          // from an earlier snapshot, even if its old attributes look valid.
          let item = gridItems(route).get(id);
          if (!item) continue;
          lastAttempt.stage = "preparing";
          lastAttempt.targetState = itemState(item);
          lastAttempt.waitedMs = 0;
          (item.link || item.card).scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          await sleep(100, signal);
          guard();
          item = gridItems(route).get(id);
          lastAttempt.targetState = itemState(item);
          if (!item) continue;
          if (selectionState(item.control) === false) {
            const targetScroll = scroller.scrollTop;
            item.control.click();
            let selected = false;
            lastAttempt.stage = "confirming";
            const confirmationStarted = Date.now();
            // A native selection count can update before its photo checkbox.
            // Wait for that same photo's state; never infer it from a total or
            // click again while the first click's outcome is uncertain.
            for (let tries = 0; tries < 40; tries++) {
              await sleep(75, signal);
              guard();
              const current = gridItems(route).get(id);
              lastAttempt.targetState = itemState(current);
              lastAttempt.waitedMs = Date.now() - confirmationStarted;
              if (current && selectionState(current.control) === true) { selected = true; break; }
              if (!current && Math.abs(scroller.scrollTop - targetScroll) > 1) scroller.scrollTo({ top: targetScroll, behavior: "instant" });
            }
            if (!selected) throw new Error("Google Photos did not confirm a selection. Stopped without clicking it again. Clear Google Photos’ current selection before retrying; your shortlist is saved. Use Check page layout to report this layout.");
          } else if (selectionState(item.control) !== true) {
            throw new Error("A photo’s selection state could not be read. Stopped without clicking an unknown control.");
          }
          confirmed.add(id);
          lastAttempt.confirmed = confirmed.size;
          lastAttempt.targetState = "selected";
          onProgress({ confirmed: confirmed.size, total: wanted.size, scanned });
        }
        if (confirmed.size === wanted.size) break;
        const before = scroller.scrollTop;
        const height = scroller.scrollHeight;
        const step = Math.max(100, scroller.clientHeight * 0.7);
        scroller.scrollTo({ top: before + step, behavior: "instant" });
        await sleep(300, signal);
        guard();
        scanned++;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 3;
        if (atBottom && scroller.scrollHeight === height && scroller.scrollTop === before) {
          bottomPasses++;
          if (bottomPasses >= 10) break;
        } else bottomPasses = 0;
        onProgress({ confirmed: confirmed.size, total: wanted.size, scanned });
      }
      lastAttempt.status = "complete";
      lastAttempt.stage = "finished";
      return { confirmed: confirmed.size, total: wanted.size, missing: wanted.size - confirmed.size };
    } catch (error) {
      lastAttempt.status = error.name === "AbortError" ? "stopped" : "error";
      error.confirmed = confirmed.size;
      error.total = wanted.size;
      throw error;
    } finally {
      // Do not scroll a different page if the user navigated away during a scan.
      if (scroller?.isConnected && location.pathname + location.search === initialPath) scroller.scrollTo({ top: initialScroll, behavior: "instant" });
    }
  }

  globalThis.PhotoShortlistAdapter = Object.freeze({ describePhoto, albumTitle, gridItems, selectionState, selectionIndicators, selectionAttempt: () => lastAttempt ? { ...lastAttempt } : null, selectKept });
})();
