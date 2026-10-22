/* Shared, dependency-free route and storage rules. No Google API calls. */
(() => {
  "use strict";
  const ORIGIN = "https://photos.google.com";
  const SETTINGS_KEY = "shortlist:settings:v1";
  const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value);
  const cleanLabel = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 180) : "";

  function parseRoute(input, base = ORIGIN) {
    try {
      const url = new URL(input, base);
      if (url.origin !== ORIGIN) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      let account = "0";
      let prefix = "";
      if (parts[0] === "u") {
        if (!/^\d{1,3}$/.test(parts[1] || "")) return null;
        account = parts[1];
        prefix = `/u/${account}`;
        parts.splice(0, 2);
      }
      const authuser = url.searchParams.get("authuser");
      if (authuser !== null) {
        if (!/^\d{1,3}$/.test(authuser) || (prefix && account !== authuser)) return null;
        account = authuser;
      }
      const accountQuery = authuser !== null && !prefix ? `?authuser=${authuser}` : "";
      const params = new URLSearchParams(accountQuery.slice(1));
      const accessKey = url.searchParams.get("key");
      if (accessKey) {
        if (accessKey.length > 2048 || /[\u0000-\u001f\u007f]/.test(accessKey)) return null;
        params.set("key", accessKey);
      }
      // Access keys stay in the live route only, so review links can reopen a
      // shared photo. They never become part of an album's stored metadata.
      const query = params.size ? `?${params}` : "";
      if (parts[0] === "photo" && parts.length === 2 && validId(parts[1])) {
        return { kind: "standalone", account, photoId: parts[1], albumId: null };
      }
      if (!["album", "share"].includes(parts[0]) || !validId(parts[1])) return null;
      if (parts.length !== 2 && !(parts.length === 4 && parts[2] === "photo" && validId(parts[3]))) return null;
      return {
        kind: parts.length === 4 ? "viewer" : "album",
        account,
        albumType: parts[0],
        albumId: parts[1],
        photoId: parts[3] || null,
        albumPath: `${prefix}/${parts[0]}/${parts[1]}`,
        accountQuery,
        query,
      };
    } catch { return null; }
  }

  function albumKey(route) {
    if (!route || !validId(route.albumId) || !/^\d{1,3}$/.test(route.account)) throw new Error("Open a Google Photos album first.");
    return `shortlist:album:v1:${route.account}:${route.albumId}`;
  }

  function photoHref(route, id) {
    if (!validId(id)) throw new Error("This photo could not be identified.");
    albumKey(route);
    return `${ORIGIN}${route.albumPath}/photo/${id}${route.query || ""}`;
  }

  function normalizeAlbum(value, route) {
    albumKey(route);
    const ids = new Set();
    const photos = [];
    for (const item of Array.isArray(value?.photos) ? value.photos : []) {
      if (!item || !validId(item.id) || ids.has(item.id)) continue;
      ids.add(item.id);
      photos.push({ id: item.id, label: cleanLabel(item.label), keptAt: Number.isFinite(item.keptAt) ? item.keptAt : 0 });
      if (photos.length === 20000) break;
    }
    return { version: 1, account: route.account, albumId: route.albumId, title: cleanLabel(value?.title), photos };
  }

  const api = Object.freeze({ ORIGIN, SETTINGS_KEY, validId, cleanLabel, parseRoute, albumKey, photoHref, normalizeAlbum });
  globalThis.PhotoShortlist = api;
  if (typeof module !== "undefined") module.exports = api;
})();
