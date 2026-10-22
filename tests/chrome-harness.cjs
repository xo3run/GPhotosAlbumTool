/*
 * A test-only Chrome API bridge. The cloud's managed Chromium blocks unpacked
 * extension installation, so the production worker runs in a VM and the actual
 * packaged content scripts run on intercepted fixture pages. This does not test
 * extension loading, isolated-world behavior, or the live Google Photos DOM.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const extensionPath = path.resolve(__dirname, "../extension");

async function attachHarness(context) {
  const data = {};
  let listener;
  const storage = {
    async get(key) { return Object.hasOwn(data, key) ? { [key]: structuredClone(data[key]) } : {}; },
    async set(values) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
        data[key] = structuredClone(value);
      }
      await Promise.all(context.pages().map((page) => page.evaluate((changes) => window.__shortlistDispatchStorage?.(changes), changes).catch(() => {})));
    },
  };
  const sandbox = vm.createContext({
    console, URL,
    chrome: { runtime: { id: "shortlist-test", onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: storage } },
    importScripts(file) { vm.runInContext(fs.readFileSync(path.join(extensionPath, file), "utf8"), sandbox, { filename: file }); },
  });
  vm.runInContext(fs.readFileSync(path.join(extensionPath, "background.js"), "utf8"), sandbox, { filename: "background.js" });
  await context.exposeFunction("__shortlistSend", (message) => new Promise((resolve) => listener(message, { id: "shortlist-test" }, resolve)));
  await context.exposeFunction("__shortlistTabs", () => [{ id: 0 }]);
  await context.exposeFunction("__shortlistTabMessage", (id, message) => context.pages()[id].evaluate((message) => window.__shortlistDispatchMessage(message), message));
  await context.exposeFunction("__shortlistOpen", async (url) => { const page = await context.newPage(); await page.goto(url); });
  await context.addInitScript(() => {
    const storageListeners = [];
    const messageListeners = [];
    window.__shortlistDispatchStorage = (changes) => storageListeners.forEach((fn) => fn(changes, "local"));
    window.__shortlistDispatchMessage = (message) => new Promise((resolve) => {
      for (const fn of messageListeners) fn(message, {}, resolve);
    });
    window.chrome = {
      runtime: {
        id: "shortlist-test",
        getURL: (file) => `https://shortlist.test/${file}`,
        sendMessage: (message) => window.__shortlistSend(message),
        onMessage: { addListener: (fn) => messageListeners.push(fn) },
      },
      storage: { onChanged: { addListener: (fn) => storageListeners.push(fn) } },
      tabs: {
        query: () => window.__shortlistTabs(),
        sendMessage: (id, message) => window.__shortlistTabMessage(id, message),
        create: ({ url }) => window.__shortlistOpen(url),
      },
    };
  });
  await context.route("https://shortlist.test/**", (route) => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!["core.js", "photos-adapter.js", "content.js", "dock.css", "popup.html", "popup.js", "popup.css"].includes(file)) return route.abort();
    const contentType = file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    return route.fulfill({ path: path.join(extensionPath, file), contentType });
  });
  const originalFixture = fs.readFileSync(path.join(__dirname, "fixtures/photos.html"), "utf8");
  const scripts = ["core.js", "photos-adapter.js", "content.js"].map((file) => `<script src="https://shortlist.test/${file}"></script>`).join("");
  await context.route("https://photos.google.com/**", (route) => route.fulfill({ body: originalFixture.replace("</body>", `${scripts}</body>`), contentType: "text/html" }));
  return { storage };
}
module.exports = { attachHarness };
