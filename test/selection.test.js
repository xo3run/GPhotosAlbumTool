const assert = require("node:assert/strict");
const test = require("node:test");
const { isAlbumUrl, selectionTargets } = require("../selection.js");

test("only individual Google Photos album routes are supported", () => {
  for (const path of ["/album/abc", "/album/abc/", "/u/2/album/abc"]) {
    assert.equal(isAlbumUrl(`https://photos.google.com${path}`), true);
  }
  for (const url of [
    undefined, "not a URL", "http://photos.google.com/album/abc",
    "https://photos.google.com.evil.test/album/abc",
    "https://photos.google.com/albums", "https://photos.google.com/album/",
    "https://photos.google.com/album/abc/photo/123", "https://example.com/album/abc"
  ]) assert.equal(isAlbumUrl(url), false);
});

test("range selection replaces selection within the loaded set", () => {
  assert.deepEqual(selectionTargets([true, false, false, false, true], "range",
    { start: 2, end: 4 }), [false, true, true, true, false]);
});

test("every Nth photo is anchored at the inclusive range start", () => {
  assert.deepEqual(selectionTargets(Array(7).fill(false), "range",
    { start: 2, end: 7, step: 2 }), [false, true, false, true, false, true, false]);
  assert.deepEqual(selectionTargets([false], "range"), [true]);
});

test("all, none, and invert derive desired states without mutating input", () => {
  const input = [true, false, true];
  assert.deepEqual(selectionTargets(input, "all"), [true, true, true]);
  assert.deepEqual(selectionTargets(input, "none"), [false, false, false]);
  assert.deepEqual(selectionTargets(input, "invert"), [false, true, false]);
  assert.deepEqual(input, [true, false, true]);
  assert.deepEqual(selectionTargets([], "all"), []);
});

test("invalid ranges and modes are rejected before selection", () => {
  for (const options of [
    { start: 0 }, { start: 3, end: 2 }, { end: 4 }, { step: 0 },
    { step: -1 }, { start: 1.5 }, { end: NaN }, { step: Infinity }
  ]) assert.throws(() => selectionTargets([false, false, false], "range", options));
  assert.throws(() => selectionTargets([], "range"));
  assert.throws(() => selectionTargets([false], "unknown"));
});
