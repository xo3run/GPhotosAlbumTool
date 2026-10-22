const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../extension/core.js");

test("album and viewer URLs share a storage key; accounts and albums do not", () => {
  const album = Core.parseRoute("https://photos.google.com/album/album-a");
  const viewer = Core.parseRoute("https://photos.google.com/album/album-a/photo/photo-1");
  assert.equal(album.kind, "album");
  assert.equal(viewer.kind, "viewer");
  assert.equal(viewer.photoId, "photo-1");
  assert.equal(Core.albumKey(album), Core.albumKey(viewer));
  assert.notEqual(Core.albumKey(album), Core.albumKey(Core.parseRoute("/u/1/album/album-a")));
  assert.notEqual(Core.albumKey(album), Core.albumKey(Core.parseRoute("/album/album-b")));
  assert.equal(Core.albumKey(Core.parseRoute("/album/album-a?authuser=1")), Core.albumKey(Core.parseRoute("/u/1/album/album-a")));
});

test("unsupported, ambiguous and foreign URLs cannot become album contexts", () => {
  for (const url of ["https://evil.example/album/a", "http://photos.google.com/album/a", "javascript:alert(1)", "/share/a/extra", "/share/a/photo/b/extra", "/albums", "/album/a/extra", "/album/a/photo/b/extra", "/album/%3Cscript%3E", "/u/1/album/a?authuser=2", "/album/a?authuser=someone@example.com"]) {
    assert.equal(Core.parseRoute(url), null, url);
  }
  assert.equal(Core.parseRoute("/photo/p1").kind, "standalone");
  assert.throws(() => Core.albumKey(Core.parseRoute("/photo/p1")));
});

test("shared album grid and deep photo links use one stable shortlist and retain access only in live links", () => {
  const grid = Core.parseRoute("/share/shared-album?key=synthetic-access-key");
  const viewer = Core.parseRoute("/share/shared-album/photo/photo-1?key=synthetic-access-key");
  assert.equal(grid.kind, "album");
  assert.equal(viewer.kind, "viewer");
  assert.equal(viewer.albumType, "share");
  assert.equal(Core.albumKey(grid), Core.albumKey(viewer));
  assert.equal(Core.albumKey(grid), Core.albumKey(Core.parseRoute("/album/shared-album")));
  assert.equal(Core.albumKey(grid), Core.albumKey(Core.parseRoute("/share/shared-album?key=replaced-access-key")));
  assert.equal(Core.photoHref(viewer, "photo-2"), "https://photos.google.com/share/shared-album/photo/photo-2?key=synthetic-access-key");
  assert.equal(viewer.accountQuery, "");
  const stored = Core.normalizeAlbum({ ...viewer, photos: [{ id: "photo-1", key: "synthetic-access-key" }] }, viewer);
  assert.equal(JSON.stringify(stored).includes("synthetic-access-key"), false);
  assert.equal(Object.hasOwn(stored, "query"), false);
});

test("shared review links preserve account and encoded access keys without unrelated parameters", () => {
  const route = Core.parseRoute("/u/2/share/album-a/photo/old?key=synthetic%2Bkey%2F%3D&unrelated=discard");
  assert.equal(Core.photoHref(route, "new"), "https://photos.google.com/u/2/share/album-a/photo/new?key=synthetic%2Bkey%2F%3D");
  const queried = Core.parseRoute("/share/album-a?authuser=1&key=synthetic-access-key");
  assert.equal(queried.account, "1");
  assert.equal(queried.accountQuery, "?authuser=1");
  assert.equal(Core.photoHref(queried, "new"), "https://photos.google.com/share/album-a/photo/new?authuser=1&key=synthetic-access-key");
  assert.notEqual(Core.albumKey(queried), Core.albumKey(Core.parseRoute("/share/album-a?key=synthetic-access-key")));
});

test("review links preserve the account without arbitrary query values", () => {
  const route = Core.parseRoute("/u/2/album/album-a/photo/old?token=not-retained");
  assert.equal(Core.photoHref(route, "new"), "https://photos.google.com/u/2/album/album-a/photo/new");
  assert.equal(Core.photoHref(Core.parseRoute("/album/a?authuser=1&secret=no"), "b"), "https://photos.google.com/album/a/photo/b?authuser=1");
  assert.throws(() => Core.photoHref(route, "../anything"));
});

test("stored records are deduplicated and only approved metadata is retained", () => {
  const album = Core.normalizeAlbum({ title: "  A\ntrip  ", token: "never", photos: [
    { id: "photo-1", label: " One\nphoto ", keptAt: 123, url: "https://private.invalid" },
    { id: "photo-1", label: "duplicate" },
    { id: "../bad" }, null, { id: "__proto__", label: "safe as an array entry" },
  ] }, Core.parseRoute("/album/a"));
  assert.equal(album.title, "A trip");
  assert.deepEqual(album.photos, [{ id: "photo-1", label: "One photo", keptAt: 123 }, { id: "__proto__", label: "safe as an array entry", keptAt: 0 }]);
  assert.equal(Object.hasOwn(album, "token"), false);
  assert.equal(Core.cleanLabel("x".repeat(500)).length, 180);
});

test("manifest uses MV3 with narrowly scoped page access and no remote code", () => {
  const manifest = require("../extension/manifest.json");
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://photos.google.com/*"]);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ["dock.css"]);
  assert.equal(manifest.externally_connectable, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});
