const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const selection = require("../selection.js");

function worker(failInjection = false) {
  let listener;
  const calls = { injections: [], badges: [], titles: [] };
  const chrome = {
    action: {
      onClicked: { addListener: (callback) => { listener = callback; } },
      setBadgeText: async (value) => { calls.badges.push(value); },
      setTitle: async (value) => { calls.titles.push(value); }
    },
    scripting: {
      executeScript: async (value) => {
        calls.injections.push(value);
        if (failInjection) throw new Error("Injection failed");
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../background.js"), "utf8"), {
    chrome, GPhotosAlbumSelection: selection, importScripts: () => {}
  });
  return { calls, click: (url) => listener({ id: 42, url }) };
}

test("toolbar injects scripts only into a supported album tab", async () => {
  const { calls, click } = worker();
  await click("https://photos.google.com/u/1/album/example");
  assert.equal(calls.injections.length, 1);
  assert.equal(calls.injections[0].target.tabId, 42);
  assert.deepEqual(Array.from(calls.injections[0].files), ["selection.js", "content.js"]);
  assert.equal(calls.badges[0].text, "");
});

test("unsupported pages are not injected and show an actionable toolbar hint", async () => {
  for (const url of [undefined, "https://example.com", "https://photos.google.com/"]) {
    const { calls, click } = worker();
    await click(url);
    assert.equal(calls.injections.length, 0);
    assert.equal(calls.badges[0].text, "!");
    assert.match(calls.titles[0].title, /Open a Google Photos album/);
  }
});

test("injection failures are reported instead of leaving an unhandled rejection", async () => {
  const { calls, click } = worker(true);
  await click("https://photos.google.com/album/example");
  assert.equal(calls.badges[0].text, "!");
  assert.equal(calls.titles[0].title, "Injection failed");
});
