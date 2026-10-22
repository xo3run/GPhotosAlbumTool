(() => {
  "use strict";
  if (document.getElementById("photo-shortlist-root")) return;
  const Core = globalThis.PhotoShortlist;
  const Photos = globalThis.PhotoShortlistAdapter;
  const Diagnostics = globalThis.PhotoShortlistDiagnostics;
  const state = {
    route: null, album: null, settings: { shortcutEnabled: true, collapsed: false },
    saving: false, running: false, controller: null, undo: null, feedback: "", feedbackKind: "info", revision: 0,
  };
  const host = document.createElement("div");
  host.id = "photo-shortlist-root";
  host.hidden = true;
  // Inline host properties prevent a page stylesheet from accidentally exposing an inactive dock.
  Object.assign(host.style, { position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483000", colorScheme: "light dark" });
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL("dock.css")}">
    <section id="dock" aria-label="Photo Shortlist">
      <header>
        <div class="brand"><span class="brand-icon" aria-hidden="true">▧</span><span>Photo Shortlist</span></div>
        <button id="collapse" class="icon-button" type="button" aria-label="Collapse shortlist" title="Collapse shortlist">−</button>
      </header>
      <div id="body">
        <div class="album-line"><span id="album-title">This album</span><span id="mode" class="tag">Album</span></div>
        <div class="count-line"><strong id="count">0</strong><span id="count-label">photos kept</span><span class="saved"><span aria-hidden="true">●</span> Saved locally</span></div>
        <p id="hint">Open a photo to start your shortlist.</p>
        <button id="keep" class="primary" type="button" aria-pressed="false"><span id="keep-icon" aria-hidden="true">＋</span><span>Keep photo</span><kbd id="key-hint">K</kbd></button>
        <button id="apply" class="primary" type="button">Select kept photos <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg></button>
        <div id="progress-area" hidden><label id="progress-label" for="progress">Selecting photos…</label><progress id="progress" max="1" value="0"></progress><button id="cancel" class="secondary" type="button">Stop selecting</button></div>
        <div class="actions"><button id="review-toggle" class="text-button" type="button" aria-expanded="false" aria-controls="review">Review shortlist</button><button id="clear" class="text-button" type="button">Clear</button></div>
        <div id="review" hidden><ol id="kept-list" aria-label="Kept photos"></ol><p id="review-note" class="small" hidden></p></div>
        <div id="feedback-wrap" hidden><p id="feedback" role="status" aria-live="polite" aria-atomic="true"></p><button id="undo" class="text-button" type="button" hidden>Undo clear</button><button id="diagnose" class="text-button" type="button" hidden>Check page layout</button></div>
        <section id="diagnostic-panel" aria-label="Layout diagnostics" hidden><label for="diagnostic-report">Layout report</label><p class="small">Layout details only: no photo links, IDs, captions, or images. Nothing is sent automatically.</p><textarea id="diagnostic-report" aria-label="Layout report" rows="7" readonly spellcheck="false"></textarea><button id="copy-diagnostic" class="secondary" type="button">Copy layout report</button><p id="diagnostic-status" class="small" role="status" aria-live="polite"></p></section>
        <details id="help"><summary>How it works</summary><ol><li>Open a photo in this album.</li><li>Use <strong>Keep photo</strong> as you browse.</li><li>Return to the grid and select kept photos.</li><li>Use Google Photos’ <strong>Add to album</strong>.</li></ol><label class="setting"><input id="shortcut" type="checkbox" checked> Enable the K shortcut</label><p class="small">Your shortlist stays in this browser. Nothing is added to an album automatically. English selection labels and semantic checkboxes are supported.</p></details>
      </div>
      <button id="expand" type="button" hidden><span class="brand-icon" aria-hidden="true">▧</span><span id="compact-count">0 kept</span><span aria-hidden="true">⌃</span></button>
    </section>`;
  document.body.append(host);
  const $ = (id) => shadow.getElementById(id);
  const count = () => state.album?.photos.length || 0;
  const sameAlbum = (a, b) => a?.albumId && b?.albumId && Core.albumKey(a) === Core.albumKey(b);

  async function request(type, extra = {}, route = state.route) {
    const response = await chrome.runtime.sendMessage({ type: `SHORTLIST_STORE_${type}`, albumUrl: route?.albumId ? `${Core.ORIGIN}${route.albumPath}${route.accountQuery || ""}` : undefined, ...extra });
    if (!response?.ok) throw new Error(response?.error || "Could not access local storage. Reload Google Photos after reloading the extension.");
    return response.data;
  }

  function announce(message, kind = "info") {
    state.feedback = message;
    state.feedbackKind = kind;
    render();
  }

  function render() {
    host.hidden = !state.route?.albumId;
    host.style.display = host.hidden ? "none" : "block";
    if (host.hidden) return;
    const isViewer = state.route.kind === "viewer";
    const busy = state.running || state.saving;
    const collapsed = state.settings.collapsed && !state.running;
    $("body").hidden = collapsed;
    shadow.querySelector("header").hidden = collapsed;
    $("expand").hidden = !collapsed;
    $("expand").setAttribute("aria-label", `Expand shortlist, ${count()} photos kept`);
    $("compact-count").textContent = `${count()} kept`;
    $("album-title").textContent = state.album?.title || "This album";
    $("album-title").title = $("album-title").textContent;
    $("mode").textContent = isViewer ? "Photo review" : "Album";
    $("count").textContent = count();
    $("count-label").textContent = count() === 1 ? "photo kept" : "photos kept";
    $("hint").textContent = isViewer
      ? (state.settings.shortcutEnabled ? "K to keep · Arrow keys to browse" : "Keep the photos you want as you browse.")
      : count() ? "Ready? Select your shortlist, then add it to an album." : "Open a photo to start your shortlist.";
    $("keep").hidden = !isViewer || state.running;
    $("apply").hidden = isViewer || state.running;
    $("keep").disabled = busy || !state.album;
    $("apply").disabled = busy || !count();
    $("collapse").disabled = state.running;
    shadow.querySelectorAll("#kept-list button").forEach((button) => { button.disabled = busy; });
    const kept = state.album?.photos.some((photo) => photo.id === state.route.photoId) || false;
    $("keep").setAttribute("aria-pressed", String(kept));
    $("keep-icon").textContent = kept ? "✓" : "＋";
    if (state.settings.shortcutEnabled) $("keep").setAttribute("aria-keyshortcuts", "K");
    else $("keep").removeAttribute("aria-keyshortcuts");
    $("key-hint").hidden = !state.settings.shortcutEnabled;
    $("progress-area").hidden = !state.running;
    $("clear").disabled = busy || !count();
    $("review-toggle").disabled = busy || !count();
    $("shortcut").checked = state.settings.shortcutEnabled;
    $("feedback-wrap").hidden = !state.feedback;
    $("feedback").textContent = state.feedback;
    $("feedback-wrap").dataset.kind = state.feedbackKind;
    $("undo").hidden = !state.undo;
    $("undo").disabled = busy;
    $("diagnose").hidden = state.feedbackKind !== "error";
    $("diagnose").disabled = busy;
  }

  function renderReview() {
    const list = $("kept-list");
    list.replaceChildren();
    (state.album?.photos || []).slice(0, 100).forEach((photo, index) => {
      const row = document.createElement("li");
      const number = document.createElement("span");
      number.className = "photo-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const link = document.createElement("a");
      link.href = Core.photoHref(state.route, photo.id);
      link.textContent = photo.label || "Photo";
      link.title = "Open this photo in Google Photos";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove photo ${index + 1} from shortlist`);
      remove.disabled = state.running || state.saving;
      remove.addEventListener("click", async () => {
        await mutate("SET_PHOTO", { photo, kept: false }, "Photo removed from shortlist.");
        const next = list.children[Math.min(index, list.children.length - 1)];
        (next?.querySelector("button") || $("review-toggle")).focus();
      });
      row.append(number, link, remove);
      list.append(row);
    });
    $("review-note").hidden = count() <= 100;
    $("review-note").textContent = `Showing the first 100 of ${count()}. All kept photos will be selected.`;
    if (!count()) {
      $("review").hidden = true;
      $("review-toggle").setAttribute("aria-expanded", "false");
    }
  }

  async function loadAlbum(route = state.route) {
    if (!route?.albumId) return;
    const revision = ++state.revision;
    const detectedTitle = Photos.albumTitle();
    const album = await request("GET", {}, route);
    if (revision !== state.revision || !sameAlbum(route, state.route)) return;
    state.album = { ...album, title: album.title || detectedTitle };
    render();
    renderReview();
  }

  async function mutate(type, extra, success) {
    if (!state.route?.albumId || state.saving || state.running) return false;
    const route = state.route;
    state.saving = true;
    render();
    try {
      const album = await request(type, { title: state.album?.title || Photos.albumTitle(), ...extra }, route);
      if (!sameAlbum(route, state.route)) return false;
      state.album = album;
      state.feedback = success;
      state.feedbackKind = "info";
      renderReview();
      return true;
    } catch (error) {
      announce(`Could not save your change. ${error.message}`, "error");
      return false;
    } finally { state.saving = false; render(); }
  }

  async function toggleKeep() {
    await syncRoute();
    if (state.route?.kind !== "viewer" || !state.album || state.saving || state.running) return;
    const id = state.route.photoId;
    const kept = state.album.photos.some((photo) => photo.id === id);
    await mutate("SET_PHOTO", { photo: { id, label: Photos.describePhoto() }, kept: !kept }, kept ? "Removed from your shortlist." : "Kept. Your shortlist is saved.");
  }

  async function setSettings(settings) {
    try { state.settings = await request("SETTINGS_SET", { settings }); render(); }
    catch (error) { announce(error.message, "error"); }
  }

  async function applySelection() {
    await syncRoute();
    if (state.route?.kind !== "album" || state.running || state.saving || !count()) return;
    state.saving = true;
    render();
    try { await loadAlbum(); }
    catch (error) { announce(error.message, "error"); return; }
    finally { state.saving = false; render(); }
    if (!count() || state.route?.kind !== "album") return;
    const route = state.route;
    state.controller = new AbortController();
    state.running = true;
    state.undo = null;
    state.feedback = "The album will scroll while kept photos are selected.";
    $("diagnostic-panel").hidden = true;
    $("review").hidden = true;
    $("review-toggle").setAttribute("aria-expanded", "false");
    $("help").open = false;
    $("progress").max = count();
    $("progress").value = 0;
    $("progress-label").textContent = `Selecting 0 of ${count()} photos…`;
    render();
    $("cancel").focus();
    try {
      const result = await Photos.selectKept(route, state.album.photos.map((photo) => photo.id), {
        signal: state.controller.signal,
        onProgress: ({ confirmed, total }) => {
          $("progress").value = confirmed;
          $("progress-label").textContent = `Selected ${confirmed} of ${total} photos…`;
        },
      });
      announce(result.missing
        ? `Selected ${result.confirmed} of ${result.total}. ${result.missing} could not be found. Check the native selection before using Add to album; your shortlist is saved.`
        : `All ${result.total} selected. Use Google Photos’ Add to album to choose a destination.`, result.missing ? "warning" : "success");
    } catch (error) {
      const prefix = error.confirmed ? `${error.confirmed} selection${error.confirmed === 1 ? "" : "s"} confirmed. ` : "";
      announce(error.name === "AbortError" ? `Stopped. ${prefix}Any photos already selected remain selected. Your shortlist is saved.` : `${prefix}${error.message}`, error.name === "AbortError" ? "info" : "error");
    } finally {
      state.running = false;
      state.controller = null;
      render();
      renderReview();
      if (!host.hidden && state.route?.kind === "album") $("apply").focus();
    }
  }

  $("keep").addEventListener("click", toggleKeep);
  $("apply").addEventListener("click", applySelection);
  $("cancel").addEventListener("click", () => state.controller?.abort());
  $("diagnose").addEventListener("click", () => {
    $("diagnostic-report").value = JSON.stringify(Diagnostics.collect(state.route, state.album?.photos.map((photo) => photo.id) || []), null, 2);
    $("diagnostic-panel").hidden = false;
    $("diagnostic-status").textContent = "Hover over a photo for a moment before generating a report to include hover-only controls.";
    $("copy-diagnostic").focus();
  });
  $("copy-diagnostic").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("diagnostic-report").value);
      $("diagnostic-status").textContent = "Report copied. You can share it with the developer.";
    } catch {
      $("diagnostic-report").focus();
      $("diagnostic-report").select();
      $("diagnostic-status").textContent = "Press Ctrl+C (Command+C on Mac) to copy the selected report.";
    }
  });
  $("collapse").addEventListener("click", async () => { await setSettings({ collapsed: true }); $("expand").focus(); });
  $("expand").addEventListener("click", async () => { await setSettings({ collapsed: false }); $("collapse").focus(); });
  $("shortcut").addEventListener("change", () => setSettings({ shortcutEnabled: $("shortcut").checked }));
  $("review-toggle").addEventListener("click", () => {
    const open = $("review").hidden;
    $("review").hidden = !open;
    $("review-toggle").setAttribute("aria-expanded", String(open));
    renderReview();
  });
  $("clear").addEventListener("click", async () => {
    const previous = [...state.album.photos];
    if (await mutate("CLEAR", {}, "Shortlist cleared. Your Google Photos selections have not changed.")) {
      state.undo = previous;
      render();
      $("undo").focus();
    }
  });
  $("undo").addEventListener("click", async () => {
    if (await mutate("RESTORE", { photos: state.undo }, "Shortlist restored.")) {
      state.undo = null;
      render();
      $("review-toggle").focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state.settings.shortcutEnabled || state.settings.collapsed || state.route?.kind !== "viewer" || event.key.toLowerCase() !== "k" || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
    const path = event.composedPath();
    if (path.includes(host) || path.some((element) => element instanceof HTMLElement && (element.isContentEditable || element.matches('input, textarea, select, button, a, [role="textbox"], [role="combobox"]')))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleKeep();
  }, true);

  let lastUrl = "";
  async function syncRoute() {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    const next = Core.parseRoute(lastUrl);
    state.controller?.abort();
    const changed = !sameAlbum(state.route, next);
    state.route = next;
    state.feedback = "";
    $("diagnostic-panel").hidden = true;
    if (changed) {
      state.album = null;
      state.undo = null;
      state.revision++;
      $("review").hidden = true;
      $("review-toggle").setAttribute("aria-expanded", "false");
    }
    render();
    renderReview();
    if (next?.albumId && (changed || !state.album)) {
      try { await loadAlbum(next); } catch (error) { announce(error.message, "error"); }
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[Core.SETTINGS_KEY]) request("SETTINGS_GET").then((settings) => { state.settings = settings; render(); }).catch((error) => announce(error.message, "error"));
    if (state.route?.albumId && changes[Core.albumKey(state.route)]) loadAlbum().catch((error) => announce(error.message, "error"));
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "SHORTLIST_STATUS") respond({ available: Boolean(state.route?.albumId), view: state.route?.kind || "unsupported", count: count(), title: state.album?.title || "This album" });
    if (message?.type === "SHORTLIST_SHOW") { setSettings({ collapsed: false }); respond({ ok: true }); }
  });
  request("SETTINGS_GET").then((settings) => { state.settings = settings; render(); }).catch((error) => announce(error.message, "error"));
  syncRoute();
  setInterval(syncRoute, 300);
  window.addEventListener("popstate", syncRoute);
  window.addEventListener("focus", () => { if (state.route?.albumId) loadAlbum().catch((error) => announce(error.message, "error")); });
})();
