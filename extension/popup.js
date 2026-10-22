"use strict";
const contextText = document.getElementById("context");
const showButton = document.getElementById("show");
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((command) => command.name === "toggle-keep")?.shortcut;
  const instruction = document.getElementById("shortcut-instruction");
  instruction.replaceChildren();
  if (shortcut) {
    const key = document.createElement("kbd");
    key.textContent = shortcut;
    instruction.append("Press ", key, " or click Keep photo.");
  } else instruction.textContent = "Click Keep photo. Assign a shortcut at chrome://extensions/shortcuts.";
}).catch(() => {});
let currentTab;

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  currentTab = tab;
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "SHORTLIST_STATUS" });
    if (status?.available) {
      contextText.textContent = `${status.title} · ${status.count} photo${status.count === 1 ? "" : "s"} kept`;
      showButton.hidden = false;
    } else contextText.textContent = status?.view === "standalone"
      ? "Open this photo from an album to start a shortlist. A standalone photo has no source album to return to."
      : "Open an album or shared album in Google Photos, then open a photo. The main photo feed isn’t supported yet.";
  } catch {
    contextText.textContent = "Open a Google Photos album. If it’s already open, refresh the page after loading the extension.";
  }
}).catch(() => { contextText.textContent = "Open a Google Photos album to start."; });

showButton.addEventListener("click", async () => {
  try { await chrome.tabs.sendMessage(currentTab.id, { type: "SHORTLIST_SHOW" }); window.close(); }
  catch { contextText.textContent = "Refresh Google Photos, then try again."; }
});
document.getElementById("open").addEventListener("click", () => chrome.tabs.create({ url: "https://photos.google.com/albums" }));
