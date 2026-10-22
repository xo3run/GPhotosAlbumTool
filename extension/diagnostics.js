/* Read-only layout diagnostics. Export only counts and explicitly allowed enums. */
(() => {
  "use strict";
  const Core = globalThis.PhotoShortlist;
  const Photos = globalThis.PhotoShortlistAdapter;
  const CONTROL_SELECTOR = 'input, button, [role], [aria-label], [data-tooltip], [jsaction]';
  const ID_ATTRIBUTES = ["data-id", "data-item-id", "data-media-id", "data-photo-id", "data-media-item-id"];
  const ATTRIBUTES = [...ID_ATTRIBUTES, "role", "aria-label", "aria-checked", "aria-selected", "aria-pressed", "aria-hidden", "tabindex", "href", "src", "class", "style", "jsaction", "jsname", "jscontroller", "data-tooltip", "data-selected", "data-latest-bg"];
  const TAGS = new Set(["a", "div", "span", "button", "input", "label", "img", "svg", "path", "main", "section", "article", "li", "ul", "ol"]);
  const ROLES = new Set(["checkbox", "button", "link", "img", "gridcell", "option", "listitem", "none", "presentation", "main", "grid", "list", "row", "rowgroup", "toolbar", "region", "dialog", "menuitem"]);
  const EVENTS = new Set(["click", "mousedown", "mouseup", "mouseover", "mouseenter", "focus", "keydown", "keypress", "keyup", "touchstart", "touchend"]);
  const shown = (element) => element.isConnected && element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]');
  const stateValue = (value) => value === null ? "absent" : ["true", "false", "mixed", "0", "1"].includes(value) ? value : "other";
  let lastHover = null;
  let hoverTimer;

  function labelHint(element) {
    const label = element.getAttribute("aria-label") || element.getAttribute("data-tooltip") || element.getAttribute("title") || "";
    if (!label) return "absent";
    if (/^(deselect|unselect)\b/i.test(label)) return "deselect";
    if (/^select\b/i.test(label)) return "select";
    if (/^\d+\s+selected$/i.test(label)) return "selected-count";
    return "other";
  }

  function metadata(element) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    return {
      tag: TAGS.has(tag) ? tag : "other",
      role: role === null ? "absent" : ROLES.has(role) ? role : "other",
      attributes: ATTRIBUTES.filter((name) => element.hasAttribute(name)),
      labelHint: labelHint(element),
      checked: stateValue(element.getAttribute("aria-checked")),
      selected: stateValue(element.getAttribute("aria-selected")),
      pressed: stateValue(element.getAttribute("aria-pressed")),
      dataSelected: stateValue(element.getAttribute("data-selected")),
      nativeChecked: element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : null,
      visible: shown(element),
      actionEvents: [...new Set((element.getAttribute("jsaction") || "").split(";").map((part) => part.split(":")[0].trim()).filter((event) => EVENTS.has(event)))],
    };
  }

  function signatures(elements, limit = 8) {
    const groups = new Map();
    for (const element of elements.slice(0, 5000)) {
      const meta = metadata(element);
      const key = JSON.stringify(meta);
      if (groups.has(key)) groups.get(key).count++;
      else groups.set(key, { ...meta, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  }

  function ancestry(element) {
    const nodes = [];
    for (let node = element; node && node !== document.body && nodes.length < 5; node = node.parentElement) {
      nodes.push({
        ...metadata(node),
        checkboxDescendants: node.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length,
        selectLabelDescendants: [...node.querySelectorAll('[aria-label], [data-tooltip]')].filter((child) => ["select", "deselect"].includes(labelHint(child))).length,
        photoLinkDescendants: [...node.querySelectorAll('a[href]')].filter((link) => Core.parseRoute(link.href)?.photoId).length,
      });
    }
    return nodes;
  }

  function photoContext(element) {
    for (let node = element, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth++) {
      if (node.matches('img, [role="img"], [data-id]') || (node.matches('a[href]') && Core.parseRoute(node.href)?.photoId)) return node;
      if (getComputedStyle(node).backgroundImage !== "none") return node;
    }
    return null;
  }

  document.addEventListener("pointerover", (event) => {
    if (!(event.target instanceof Element) || event.composedPath().some((node) => node.id === "photo-shortlist-root")) return;
    if (Core.parseRoute(location.href)?.kind !== "album") return;
    const context = photoContext(event.target);
    if (!context) return;
    clearTimeout(hoverTimer);
    const pagePath = location.pathname;
    hoverTimer = setTimeout(() => {
      if (!context.isConnected || location.pathname !== pagePath) return;
      // Store sanitized metadata immediately while hover-only controls are present.
      let card = context;
      for (let depth = 0; card.parentElement && depth < 3; depth++) {
        const parent = card.parentElement;
        if (parent === document.body || parent.querySelectorAll('a[href]').length > 1) break;
        card = parent;
      }
      lastHover = { pagePath, ancestors: ancestry(context), controls: signatures([...card.querySelectorAll(CONTROL_SELECTOR)], 6) };
    }, 180);
  }, { capture: true, passive: true });

  function collect(route, keptIds = []) {
    const kept = new Set(keptIds);
    const anchors = [...document.querySelectorAll('a[href]')];
    const photoLinks = anchors.filter((link) => Core.parseRoute(link.href)?.photoId);
    const candidates = [...document.querySelectorAll(CONTROL_SELECTOR)];
    const readable = candidates.filter((element) => Photos.selectionState(element) !== null);
    const dataNodes = [...document.querySelectorAll(ID_ATTRIBUTES.map((name) => `[${name}]`).join(","))];
    const matched = photoLinks.filter((link) => kept.has(Core.parseRoute(link.href)?.photoId));
    const items = route?.albumId ? Photos.gridItems(route) : new Map();
    return {
      schema: 1,
      extensionVersion: chrome.runtime.getManifest().version,
      albumType: ["album", "share"].includes(route?.albumType) ? route.albumType : "other",
      view: ["album", "viewer", "standalone"].includes(route?.kind) ? route.kind : "other",
      counts: {
        keptPhotos: kept.size,
        anchors: anchors.length,
        photoLinks: photoLinks.length,
        visiblePhotoLinks: photoLinks.filter(shown).length,
        linksMatchingKeptPhotos: matched.length,
        linkResolutionDifferences: photoLinks.filter((link) => Core.parseRoute(link.href)?.photoId !== Core.parseRoute(link.getAttribute("href"), location.href)?.photoId).length,
        dataIdentifierNodes: dataNodes.length,
        dataIdentifiersMatchingKeptPhotos: dataNodes.filter((element) => ID_ATTRIBUTES.some((name) => kept.has(element.getAttribute(name)))).length,
        semanticCheckboxes: document.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length,
        readableSelectionControls: readable.length,
        visibleReadableSelectionControls: readable.filter(shown).length,
        recognizedGridItems: items.size,
      },
      nativeSelection: Photos.selectionIndicators(items),
      selectionAttempt: Photos.selectionAttempt(),
      controlSignatures: signatures(candidates),
      photoSamples: (matched.length ? matched : photoLinks).slice(0, 2).map(ancestry),
      hoveredPhoto: lastHover?.pagePath === location.pathname ? { ancestors: lastHover.ancestors, controls: lastHover.controls } : null,
    };
  }

  globalThis.PhotoShortlistDiagnostics = Object.freeze({ collect });
})();
