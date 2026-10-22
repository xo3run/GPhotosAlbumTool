importScripts("selection.js");

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!GPhotosAlbumSelection.isAlbumUrl(tab.url)) {
      throw new Error("Open a Google Photos album, then click this extension again.");
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["selection.js", "content.js"]
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.action.setTitle({ tabId: tab.id, title: "Open album selection tools" });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setTitle({ tabId: tab.id, title: error.message });
  }
});
