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
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, "manifest.json"), "utf8"));
  let shortcut = manifest.commands["toggle-keep"].suggested_key.default;
  const commands = () => [{ name: "toggle-keep", shortcut }];
  const data = {};
  let listener;
  let commandListener;
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
    console, URL, URLSearchParams,
    chrome: { runtime: { id: "shortlist-test", onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: storage } },
    importScripts(file) { vm.runInContext(fs.readFileSync(path.join(extensionPath, file), "utf8"), sandbox, { filename: file }); },
  });
  sandbox.chrome.commands = { getAll: async () => commands(), onCommand: { addListener(fn) { commandListener = fn; } } };
  sandbox.chrome.tabs = {
    query: async () => [{ id: 0 }],
    sendMessage: (id, message) => context.pages()[id].evaluate((message) => window.__shortlistDispatchMessage(message), message),
  };
  vm.runInContext(fs.readFileSync(path.join(extensionPath, "background.js"), "utf8"), sandbox, { filename: "background.js" });
  await context.exposeFunction("__shortlistSend", (message) => new Promise((resolve) => listener(message, { id: "shortlist-test" }, resolve)));
  await context.exposeFunction("__shortlistTabs", () => [{ id: 0 }]);
  await context.exposeFunction("__shortlistTabMessage", (id, message) => context.pages()[id].evaluate((message) => window.__shortlistDispatchMessage(message), message));
  await context.exposeFunction("__shortlistOpen", async (url) => { const page = await context.newPage(); await page.goto(url); });
  await context.exposeFunction("__shortlistGetCommands", commands);
  await context.exposeBinding("__shortlistRunCommand", async ({ page }, command) => commandListener(command, { id: context.pages().indexOf(page) }));
  await context.addInitScript((manifest) => {
    const storageListeners = [];
    const messageListeners = [];
    window.__shortlistDispatchStorage = (changes) => storageListeners.forEach((fn) => fn(changes, "local"));
    window.__shortlistDispatchMessage = (message) => new Promise((resolve) => {
      for (const fn of messageListeners) fn(message, {}, resolve);
    });
    window.chrome = {
      runtime: {
        id: "shortlist-test",
        getManifest: () => manifest,
        getURL: (file) => `https://shortlist.test/${file}`,
        sendMessage: (message) => window.__shortlistSend(message),
        onMessage: { addListener: (fn) => messageListeners.push(fn) },
      },
      storage: { onChanged: { addListener: (fn) => storageListeners.push(fn) } },
      commands: { getAll: () => window.__shortlistGetCommands() },
      tabs: {
        query: () => window.__shortlistTabs(),
        sendMessage: (id, message) => window.__shortlistTabMessage(id, message),
        create: ({ url }) => window.__shortlistOpen(url),
      },
    };
    // Simulate Chrome dispatching a registered browser command before webpage
    // listeners. Production content.js installs no DOM keyboard shortcut.
    window.__shortlistBrowserShortcut = manifest.commands["toggle-keep"].suggested_key.default;
    window.addEventListener("keydown", (event) => {
      const keys = window.__shortlistBrowserShortcut.split("+");
      const key = keys.at(-1);
      if (!key || event.repeat || event.code !== `Key${key.toUpperCase()}` || event.altKey !== keys.includes("Alt") || event.shiftKey !== keys.includes("Shift") || event.ctrlKey !== keys.includes("Ctrl") || event.metaKey !== keys.includes("Command")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.__shortlistLastCommand = window.__shortlistRunCommand("toggle-keep").catch(() => {});
    }, true);
  }, manifest);
  await context.route("https://shortlist.test/**", (route) => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!["core.js", "photos-adapter.js", "diagnostics.js", "content.js", "dock.css", "popup.html", "popup.js", "popup.css"].includes(file)) return route.abort();
    const contentType = file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
    return route.fulfill({ path: path.join(extensionPath, file), contentType });
  });
  const originalFixture = fs.readFileSync(path.join(__dirname, "fixtures/photos.html"), "utf8");
  const scripts = manifest.content_scripts[0].js.map((file) => `<script src="https://shortlist.test/${file}"></script>`).join("");
  await context.route("https://photos.google.com/**", (route) => route.fulfill({ body: originalFixture.replace("</body>", `${scripts}</body>`), contentType: "text/html" }));
  return {
    storage,
    async setShortcut(value) {
      shortcut = value;
      await Promise.all(context.pages().map((page) => page.evaluate((value) => { window.__shortlistBrowserShortcut = value; }, value)));
    },
  };
}
module.exports = { attachHarness };
