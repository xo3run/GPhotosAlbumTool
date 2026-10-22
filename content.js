(() => {
  const id = "gphotos-album-selection";
  const previous = document.getElementById(id);
  if (previous) {
    previous.shadowRoot.querySelector("button").focus();
    return;
  }
  if (!GPhotosAlbumSelection.isAlbumUrl(location.href)) return;

  const albumUrl = location.href;
  const host = document.createElement("div");
  host.id = id;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; right: 16px; bottom: 16px;
        z-index: 2147483647; max-width: calc(100vw - 32px); }
      section { box-sizing: border-box; width: 340px; max-width: 100%; padding: 16px;
        background: white; color: #202124; border: 1px solid #dadce0;
        border-radius: 12px; box-shadow: 0 4px 20px #0003; font: 14px/1.5 system-ui; }
      h2 { font-size: 17px; margin: 0; }
      p { margin: 10px 0; }
      .fields, .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
      label { flex: 1; }
      input { box-sizing: border-box; display: block; width: 85px; padding: 6px; }
      button { cursor: pointer; padding: 7px; background: #f1f3f4; color: #202124;
        border: 1px solid #dadce0; border-radius: 4px; font: inherit; }
      button:disabled { cursor: default; opacity: .6; }
      #close { float: right; }
    </style>
    <section aria-label="Album selection tools">
      <button id="close" aria-label="Close selection tools">×</button>
      <h2>Album selection</h2>
      <p>Only currently loaded photos are affected. Scroll to load photos, then
        refresh the count. Positions follow their page order, starting at 1.</p>
      <p id="count"></p>
      <button id="refresh">Refresh count</button>
      <div class="fields">
        <label>From<input id="start" type="number" min="1" step="1" value="1"></label>
        <label>To<input id="end" type="number" min="1" step="1"></label>
        <label>Every<input id="step" type="number" min="1" step="1" value="1"></label>
      </div>
      <div class="actions">
        <button data-mode="range">Select range</button>
        <button data-mode="all">Select loaded</button>
        <button data-mode="invert">Invert loaded</button>
        <button data-mode="none">Clear loaded</button>
      </div>
      <button id="stop" disabled>Stop</button>
      <p id="status" role="status" aria-live="polite"></p>
      <p>Review Google Photos' total selected count (including offscreen selections).
        Then use its <strong>+ / Add to → Album</strong> control to choose or create
        a destination album. This tool never moves or deletes photos.</p>
    </section>`;
  document.documentElement.append(host);
  const field = (name) => root.getElementById(name);
  let stopped = false;
  let running = false;
  let closed = false;

  function photos() {
    const result = [];
    const seen = new Set();
    for (const checkbox of document.querySelectorAll('[role="checkbox"][aria-checked]')) {
      if (!["true", "false"].includes(checkbox.getAttribute("aria-checked"))) continue;
      if (!checkbox.getClientRects().length) continue;
      let tile = checkbox;
      let links = [];
      for (let depth = 0; tile && depth < 4; depth++, tile = tile.parentElement) {
        links = [...tile.querySelectorAll('a[href*="/photo/"], a[href*="/video/"]')];
        if (tile.matches('a[href*="/photo/"], a[href*="/video/"]')) links.push(tile);
        if (links.length) break;
      }
      if (links.length !== 1 || seen.has(links[0].href)) continue;
      seen.add(links[0].href);
      result.push({ checkbox, href: links[0].href, link: links[0] });
    }
    return result;
  }

  function refresh(resetRange = true) {
    const items = photos();
    field("count").textContent = `${items.length} loaded photos; ${
      items.filter(({ checkbox }) => checkbox.getAttribute("aria-checked") === "true").length
    } selected among them.`;
    if (resetRange) field("end").value = items.length || "";
    return items;
  }

  function cancelled() {
    return stopped || closed || location.href !== albumUrl;
  }

  async function apply(mode) {
    if (running) return;
    if (location.href !== albumUrl) {
      field("status").textContent = "Album changed. Close and reopen the tools.";
      return;
    }
    const items = photos();
    if (!items.length) {
      field("status").textContent = "No supported photo controls found. Load photos and try again.";
      return;
    }
    let targets;
    try {
      targets = GPhotosAlbumSelection.selectionTargets(
        items.map(({ checkbox }) => checkbox.getAttribute("aria-checked") === "true"),
        mode,
        { start: Number(field("start").value), end: Number(field("end").value),
          step: Number(field("step").value) }
      );
    } catch (error) {
      field("status").textContent = error.message;
      return;
    }
    running = true;
    stopped = false;
    root.querySelectorAll("input, [data-mode], #refresh").forEach((el) => { el.disabled = true; });
    field("stop").disabled = false;
    field("status").textContent = "Applying selection… Keep the album still.";
    try {
      for (let index = 0; index < items.length; index++) {
        if (cancelled()) throw new Error("Stopped. Some photos may already have changed selection.");
        const { checkbox, href, link } = items[index];
        if (!checkbox.isConnected || !link.isConnected || link.href !== href) {
          throw new Error("Loaded photos changed. Refresh the count and try again.");
        }
        const target = String(targets[index]);
        if (checkbox.getAttribute("aria-checked") === target) continue;
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
          checkbox.dispatchEvent(new EventType(type, { bubbles: true, cancelable: true, view: window }));
        }
        const deadline = Date.now() + 1500;
        while (checkbox.getAttribute("aria-checked") !== target && Date.now() < deadline && !cancelled()) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (cancelled()) throw new Error("Stopped. Some photos may already have changed selection.");
        if (!checkbox.isConnected || !link.isConnected || link.href !== href ||
            checkbox.getAttribute("aria-checked") !== target) {
          throw new Error("Google Photos did not confirm the selection. Stopped; review your selection.");
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      field("status").textContent = "Selection ready. Review it, then use Google Photos' Add to album.";
    } catch (error) {
      field("status").textContent = error.message;
    } finally {
      running = false;
      root.querySelectorAll("input, [data-mode], #refresh").forEach((el) => { el.disabled = false; });
      field("stop").disabled = true;
      refresh(false);
    }
  }

  field("close").addEventListener("click", () => { closed = true; host.remove(); });
  field("stop").addEventListener("click", () => { stopped = true; });
  field("refresh").addEventListener("click", () => refresh());
  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => apply(button.dataset.mode));
  });
  refresh();
})();
