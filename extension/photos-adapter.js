/* Google Photos DOM integration lives here. Fail closed when a control is ambiguous. */
(() => {
  "use strict";
  const Core = globalThis.PhotoShortlist;
  const CONTROLS = 'input[type="checkbox"], [role="checkbox"], button[aria-label], [role="button"][aria-label]';
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Stopped", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Stopped", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
  const displayed = (element) => element.isConnected && element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]');

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
    const parsed = Core.parseRoute(link.getAttribute("href"), location.href);
    if (!parsed?.photoId || parsed.account !== route.account) return null;
    return !parsed.albumId || parsed.albumId === route.albumId ? parsed.photoId : null;
  }

  function findControl(link, route) {
    let card = link;
    for (let depth = 0; card && card !== document.body && depth < 6; depth++, card = card.parentElement) {
      const ids = new Set([...card.querySelectorAll('a[href*="/photo/"]')].map((a) => photoIdFromLink(a, route)).filter(Boolean));
      if (ids.size > 1) return null;
      const controls = [...card.querySelectorAll(CONTROLS)].filter((element) => selectionState(element) !== null && displayed(element));
      if (controls.length === 1) return { card, control: controls[0] };
      if (controls.length > 1) return null;
    }
    return null;
  }

  function gridItems(route) {
    const items = new Map();
    for (const link of document.querySelectorAll('a[href*="/photo/"]')) {
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
      const controls = [...card.querySelectorAll(CONTROLS)].filter((control) => selectionState(control) !== null && displayed(control));
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

  function hasNativeSelection() {
    if ([...document.querySelectorAll(CONTROLS)].some((control) => displayed(control) && selectionState(control) === true)) return true;
    // The selected tile may be virtualized out of the DOM. Check the native toolbar too.
    if ([...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')].some((button) => displayed(button) && /^(clear selection|cancel selection|deselect all|unselect all)$/i.test(button.getAttribute("aria-label").trim()))) return true;
    return [...document.querySelectorAll('header span, [role="toolbar"] span, [aria-live]')].some((element) => displayed(element) && /^\s*[1-9][\d,]*\s+(?:items?\s+)?selected\s*$/i.test(element.textContent));
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
    const guard = () => {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      if (location.pathname + location.search !== initialPath || Core.parseRoute(location.href)?.kind !== "album") throw new DOMException("The page changed", "AbortError");
      if (Date.now() - started > 180000) throw new Error("The scan timed out. Some photos may already be selected; retry to continue.");
    };
    try {
      guard();
      let items = gridItems(route);
      if (!items.size) throw new Error(route.albumType === "share"
        ? "No supported photo selection controls found in this shared view. Open the album from your Google Photos library if it offers selection there, or report this layout for an extension update. Your shortlist is saved."
        : "No supported photo selection controls found. Open the album grid and retry. This Google Photos layout may need an extension update.");
      if (hasNativeSelection()) throw new Error("Clear Google Photos’ existing selection first, then retry. Your shortlist is saved.");
      scroller = scrollContainer(items);
      initialScroll = scroller.scrollTop;
      scroller.scrollTo({ top: 0, behavior: "instant" });
      await sleep(250, signal);
      while (confirmed.size < wanted.size) {
        guard();
        items = gridItems(route);
        for (const [id, item] of items) {
          if (!wanted.has(id) || confirmed.has(id)) continue;
          guard();
          if (selectionState(item.control) === false) {
            item.control.click();
            let selected = false;
            for (let tries = 0; tries < 12; tries++) {
              await sleep(75, signal);
              guard();
              const current = gridItems(route).get(id);
              if (current && selectionState(current.control) === true) { selected = true; break; }
            }
            if (!selected) throw new Error("Google Photos did not confirm a selection. Stopped to avoid clicking the wrong control. This layout may need an extension update.");
          } else if (selectionState(item.control) !== true) {
            throw new Error("A photo’s selection state could not be read. Stopped without clicking an unknown control.");
          }
          confirmed.add(id);
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
      return { confirmed: confirmed.size, total: wanted.size, missing: wanted.size - confirmed.size };
    } catch (error) {
      error.confirmed = confirmed.size;
      error.total = wanted.size;
      throw error;
    } finally {
      // Do not scroll a different page if the user navigated away during a scan.
      if (scroller?.isConnected && location.pathname + location.search === initialPath) scroller.scrollTo({ top: initialScroll, behavior: "instant" });
    }
  }

  globalThis.PhotoShortlistAdapter = Object.freeze({ describePhoto, albumTitle, gridItems, selectionState, selectKept });
})();
