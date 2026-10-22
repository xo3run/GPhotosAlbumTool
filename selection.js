(() => {
  function isAlbumUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === "https://photos.google.com" &&
        /^\/(?:u\/\d+\/)?album\/[^/]+\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  function selectionTargets(selected, mode, { start = 1, end = selected.length, step = 1 } = {}) {
    if (!["all", "none", "invert", "range"].includes(mode)) {
      throw new Error("Unknown selection mode.");
    }
    if (mode === "range" && (
      ![start, end, step].every(Number.isSafeInteger) ||
      start < 1 || end < start || end > selected.length || step < 1
    )) {
      throw new Error(`Use whole numbers: 1 ≤ From ≤ To ≤ ${selected.length}, and Every ≥ 1.`);
    }
    return selected.map((checked, index) => {
      if (mode === "all") return true;
      if (mode === "none") return false;
      if (mode === "invert") return !checked;
      const position = index + 1;
      return position >= start && position <= end && (position - start) % step === 0;
    });
  }

  const api = { isAlbumUrl, selectionTargets };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.GPhotosAlbumSelection = api;
})();
