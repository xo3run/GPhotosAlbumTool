"use strict";
const contextText = document.getElementById("context");
const showButton = document.getElementById("show");
let currentTab;

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  currentTab = tab;
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "SHORTLIST_STATUS" });
    if (status?.available) {
      contextText.textContent = `${status.title} · ${status.count} photo${status.count === 1 ? "" : "s"} kept`;
      showButton.hidden = false;
    } else contextText.textContent = "Open a regular album in Google Photos to start. Shared album links and the main photo feed aren’t supported yet.";
  } catch {
    contextText.textContent = "Open a Google Photos album. If it’s already open, refresh the page after loading the extension.";
  }
}).catch(() => { contextText.textContent = "Open a Google Photos album to start."; });

showButton.addEventListener("click", async () => {
  try { await chrome.tabs.sendMessage(currentTab.id, { type: "SHORTLIST_SHOW" }); window.close(); }
  catch { contextText.textContent = "Refresh Google Photos, then try again."; }
});
document.getElementById("open").addEventListener("click", () => chrome.tabs.create({ url: "https://photos.google.com/albums" }));
