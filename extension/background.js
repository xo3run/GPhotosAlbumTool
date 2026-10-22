"use strict";
importScripts("core.js");
const Core = globalThis.PhotoShortlist;
let pending = Promise.resolve();

// Serialize read/modify/write operations so different tabs cannot lose each other's keeps.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message?.type?.startsWith("SHORTLIST_STORE_")) return false;
  const operation = pending.then(() => handle(message));
  pending = operation.catch(() => {});
  operation.then((data) => respond({ ok: true, data }), (error) => respond({ ok: false, error: error.message || "Local storage is unavailable." }));
  return true;
});

async function handle(message) {
  if (message.type === "SHORTLIST_STORE_SETTINGS_GET") {
    const stored = (await chrome.storage.local.get(Core.SETTINGS_KEY))[Core.SETTINGS_KEY];
    return { shortcutEnabled: stored?.shortcutEnabled !== false, collapsed: stored?.collapsed === true };
  }
  if (message.type === "SHORTLIST_STORE_SETTINGS_SET") {
    const current = await handle({ type: "SHORTLIST_STORE_SETTINGS_GET" });
    for (const key of ["shortcutEnabled", "collapsed"]) {
      if (typeof message.settings?.[key] === "boolean") current[key] = message.settings[key];
    }
    await chrome.storage.local.set({ [Core.SETTINGS_KEY]: current });
    return current;
  }

  const route = Core.parseRoute(message.albumUrl);
  const key = Core.albumKey(route);
  const stored = (await chrome.storage.local.get(key))[key];
  const album = Core.normalizeAlbum(stored, route);
  if (message.type === "SHORTLIST_STORE_GET") return album;
  if (message.type === "SHORTLIST_STORE_SET_PHOTO") {
    if (!Core.validId(message.photo?.id) || typeof message.kept !== "boolean") throw new Error("This photo could not be identified.");
    const existing = album.photos.some((photo) => photo.id === message.photo.id);
    if (message.kept && !existing) {
      if (album.photos.length >= 20000) throw new Error("This shortlist has reached the 20,000-photo album limit.");
      album.photos.push({ id: message.photo.id, label: Core.cleanLabel(message.photo.label), keptAt: Date.now() });
    } else if (!message.kept) {
      album.photos = album.photos.filter((photo) => photo.id !== message.photo.id);
    }
  } else if (message.type === "SHORTLIST_STORE_CLEAR") {
    album.photos = [];
  } else if (message.type === "SHORTLIST_STORE_RESTORE") {
    const restored = Core.normalizeAlbum({ photos: message.photos }, route);
    const existing = new Set(album.photos.map((photo) => photo.id));
    album.photos.push(...restored.photos.filter((photo) => !existing.has(photo.id)));
    if (album.photos.length > 20000) throw new Error("The restored shortlist would exceed 20,000 photos.");
  } else {
    throw new Error("Unknown shortlist operation.");
  }
  if (Core.cleanLabel(message.title)) album.title = Core.cleanLabel(message.title);
  await chrome.storage.local.set({ [key]: album });
  return album;
}
