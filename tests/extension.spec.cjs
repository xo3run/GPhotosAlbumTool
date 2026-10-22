const { test: base, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { attachHarness } = require("./chrome-harness.cjs");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const photoId = (n) => `photo-${String(n).padStart(3, "0")}`;

const test = base.extend({
  browserSession: async ({}, use) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shortlist-browser-"));
    const executablePath = process.env.SHORTLIST_CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
    const context = await chromium.launchPersistentContext(profile, {
      executablePath, channel: executablePath ? undefined : "chromium", headless: true,
      viewport: { width: 1280, height: 900 }, colorScheme: "light",
      args: ["--no-sandbox"],
    });
    try {
      const { storage, setShortcut } = await attachHarness(context);
      const page = context.pages()[0] || await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("https://photos.google.com/album/album-a");
      await expect(page.locator("#photo-shortlist-root")).toBeVisible();
      await expect(page.locator("#photo-shortlist-root #apply")).toBeDisabled();
      const seed = async (ids, album = "album-a", account = "0") => {
        await storage.set({ [`shortlist:album:v1:${account}:${album}`]: { title: "Weekend in the mountains", photos: ids.map((id) => ({ id, label: "Mountain lake", keptAt: 1 })) } });
        await expect(page.locator("#photo-shortlist-root #count")).toHaveText(String(ids.length));
      };
      await use({ context, page, seed, setShortcut });
      expect(errors).toEqual([]);
    } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  },
});

const navigate = (page, pathname) => page.evaluate((pathname) => window.fixture.go(pathname), pathname);
const count = (page) => page.locator("#photo-shortlist-root #count");
const feedback = (page) => page.locator("#photo-shortlist-root #feedback");

for (const { width, position } of [{ width: 1280, position: "bottom-left" }, { width: 390, position: "bottom-right" }]) {
test(`keeping and unkeeping preserve the button position without moving the mouse (${width}px, ${position})`, async ({ browserSession: { page } }) => {
  await page.setViewportSize({ width, height: 844 });
  if (position === "bottom-right") {
    await page.locator("#photo-shortlist-root summary").click();
    await page.getByLabel("Panel position", { exact: true }).selectOption(position);
    await expect(page.locator("#photo-shortlist-root")).toHaveCSS("right", "20px");
    await page.locator("#photo-shortlist-root summary").click();
  }
  await navigate(page, "/album/album-a/photo/photo-001");
  const keep = page.getByRole("button", { name: "Keep photo", exact: false });
  await expect(keep).toBeEnabled();
  await expect(keep).toHaveAttribute("aria-keyshortcuts", "Alt+Shift+S");
  const before = await keep.boundingBox();
  // Click near the lower edge, where a newly inserted status card used to
  // move the button away from the pointer.
  await page.mouse.click(before.x + before.width / 2, before.y + before.height - 5);
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(count(page)).toHaveText("1");
  await expect(page.locator("#photo-shortlist-root #hint")).toHaveText("Kept. Your shortlist is saved.");
  expect(await keep.boundingBox()).toEqual(before);
  await page.mouse.down();
  await page.mouse.up();
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await expect(count(page)).toHaveText("0");
  await expect(page.locator("#photo-shortlist-root #hint")).toHaveText("Removed from your shortlist.");
  expect(await keep.boundingBox()).toEqual(before);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/photo\/photo-002$/);
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  expect(await keep.boundingBox()).toEqual(before);
});
}

test("panel defaults to bottom-left and remembers a bottom-right preference across tabs, reloads and collapse", async ({ browserSession: { page, context } }) => {
  const dock = page.locator("#photo-shortlist-root");
  const expectCorner = async (target, side) => {
    await expect.poll(async () => {
      const bounds = await target.locator("#photo-shortlist-root").boundingBox();
      const viewport = target.viewportSize();
      return bounds && { bottom: Math.round(viewport.height - bounds.y - bounds.height), side: Math.round(side === "left" ? bounds.x : viewport.width - bounds.x - bounds.width) };
    }).toEqual({ bottom: 20, side: 20 });
  };
  await expectCorner(page, "left");
  await page.locator("#photo-shortlist-root summary").click();
  await page.getByLabel("Panel position", { exact: true }).selectOption("bottom-right");
  await expectCorner(page, "right");
  const second = await context.newPage();
  await second.goto("https://photos.google.com/album/album-a/photo/photo-001");
  await expect(second.locator("#photo-shortlist-root #keep")).toBeEnabled();
  await expectCorner(second, "right");
  await page.reload();
  await expect(dock).toBeVisible();
  await expectCorner(page, "right");
  await page.getByRole("button", { name: "Collapse shortlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand shortlist, 0 photos kept" })).toBeVisible();
  await expectCorner(page, "right");
  await page.getByRole("button", { name: "Expand shortlist, 0 photos kept" }).click();
  await page.locator("#photo-shortlist-root summary").click();
  await page.getByLabel("Panel position", { exact: true }).selectOption("bottom-left");
  await expectCorner(page, "left");
  await expect.poll(() => second.locator("#photo-shortlist-root").evaluate((host) => host.style.left)).toBe("20px");
  await expectCorner(second, "left");
  // Updating other preferences preserves the corner; invalid updates are ignored.
  const response = await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "SHORTLIST_STORE_SETTINGS_SET", settings: { shortcutEnabled: false, collapsed: true } });
    await chrome.runtime.sendMessage({ type: "SHORTLIST_STORE_SETTINGS_SET", settings: { position: "invalid" } });
    return chrome.runtime.sendMessage({ type: "SHORTLIST_STORE_SETTINGS_GET" });
  });
  expect(response.data).toEqual({ shortcutEnabled: false, collapsed: true, position: "bottom-left" });
});

test("keeps only explicit picks; keyboard does not interfere with typing and can be disabled", async ({ browserSession: { page } }) => {
  await navigate(page, "/album/album-a/photo/photo-001");
  const keep = page.getByRole("button", { name: "Keep photo", exact: false });
  await expect(keep).toBeVisible();
  await expect(count(page)).toHaveText("0");
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(count(page)).toHaveText("1");
  await page.mouse.click(300, 80);
  await page.keyboard.press("ArrowRight");
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Alt+Shift+S");
  await expect(count(page)).toHaveText("2");
  await page.keyboard.press("ArrowRight");
  await page.evaluate(() => window.fixture.addCommentInput());
  await page.getByRole("textbox", { name: "Comment" }).fill("k");
  await page.keyboard.press("Alt+Shift+S");
  await page.evaluate(() => window.__shortlistLastCommand);
  await expect(count(page)).toHaveText("2");
  await page.locator("#photo-shortlist-root summary").click();
  await page.getByLabel("Enable keyboard shortcut").uncheck();
  await page.mouse.click(300, 80);
  await page.keyboard.press("Alt+Shift+S");
  await page.evaluate(() => window.__shortlistLastCommand);
  await expect(keep).not.toHaveAttribute("aria-keyshortcuts", "Alt+Shift+S");
  await expect(count(page)).toHaveText("2");
  await keep.click();
  await expect(count(page)).toHaveText("3");
});

test("K retains native photo navigation while the browser shortcut keeps the current photo", async ({ browserSession: { page } }) => {
  await navigate(page, "/album/album-a/photo/photo-003");
  await expect(page.getByRole("button", { name: "Keep photo", exact: false })).toBeEnabled();
  await page.mouse.click(300, 80);
  await page.keyboard.press("k");
  await expect(page).toHaveURL("https://photos.google.com/album/album-a/photo/photo-002");
  await expect(count(page)).toHaveText("0");
  // A native button retaining focus must not block the modifier shortcut.
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(page).toHaveURL("https://photos.google.com/album/album-a/photo/photo-003");
  await page.keyboard.press("Alt+Shift+S");
  await expect(count(page)).toHaveText("1");
  await expect(page.getByRole("button", { name: "Keep photo", exact: false })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL("https://photos.google.com/album/album-a/photo/photo-003");
  await page.keyboard.press("Alt+Shift+S");
  await expect(count(page)).toHaveText("0");
});

test("the UI follows a remapped or unassigned browser shortcut", async ({ browserSession: { page, setShortcut } }) => {
  await navigate(page, "/album/album-a/photo/photo-001");
  const keep = page.getByRole("button", { name: "Keep photo", exact: false });
  await expect(keep).toHaveAttribute("aria-keyshortcuts", "Alt+Shift+S");
  await setShortcut("Ctrl+Shift+Y");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(keep).toHaveAttribute("aria-keyshortcuts", "Control+Shift+Y");
  await expect(page.locator("#photo-shortlist-root #key-hint")).toHaveText("Ctrl+Shift+Y");
  await page.mouse.click(300, 80);
  await page.keyboard.press("Control+Shift+Y");
  await expect(count(page)).toHaveText("1");
  await setShortcut("");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#photo-shortlist-root #key-hint")).toBeHidden();
  await expect(page.locator("#photo-shortlist-root #hint")).toContainText("Assign a shortcut");
  await keep.click();
  await expect(count(page)).toHaveText("0");
});

test("saved progress survives refresh, stays separate across albums and account slots, and stays hidden outside albums", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1), photoId(3)]);
  await page.reload();
  await expect(count(page)).toHaveText("2");
  await navigate(page, "/album/album-b");
  await expect(count(page)).toHaveText("0");
  await navigate(page, "/u/1/album/album-a");
  await expect(count(page)).toHaveText("0");
  await navigate(page, "/u/0/album/album-a");
  await expect(count(page)).toHaveText("2");
  await navigate(page, "/photos");
  await expect(page.locator("#photo-shortlist-root")).toBeHidden();
});

for (const prefix of ["", "/u/1"]) {
  test(`shared album deep links show the toolbar, retain picks and select the grid (${prefix || "default account"})`, async ({ browserSession: { page, context } }) => {
    const accessKey = "synthetic-access-key";
    const albumPath = `${prefix}/share/shared-album`;
    await page.goto(`https://photos.google.com${albumPath}/photo/photo-001?key=${accessKey}`);
    const keep = page.getByRole("button", { name: "Keep photo", exact: false });
    await expect(keep).toBeVisible();
    await expect(keep).toBeEnabled();
    await keep.click();
    await expect(count(page)).toHaveText("1");
    await page.mouse.click(300, 80);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+Shift+S");
    await expect(count(page)).toHaveText("2");
    await page.reload();
    await expect(count(page)).toHaveText("2");
    await page.getByRole("button", { name: "Review shortlist" }).click();
    await expect(page.locator("#photo-shortlist-root #kept-list a").first()).toHaveAttribute("href", `https://photos.google.com${albumPath}/photo/photo-001?key=${accessKey}`);
    const response = await page.evaluate(() => chrome.runtime.sendMessage({ type: "SHORTLIST_STORE_GET", albumUrl: location.origin + location.pathname }));
    expect(response.ok).toBe(true);
    expect(response.data.photos).toHaveLength(2);
    expect(JSON.stringify(response.data)).not.toContain(accessKey);
    expect(JSON.stringify(response.data)).not.toContain("key=");
    const popup = await context.newPage();
    await popup.goto("https://shortlist.test/popup.html");
    await expect(popup.getByRole("button", { name: "Show shortlist in this album" })).toBeVisible();
    await popup.close();
    await page.getByRole("button", { name: "Back to album" }).click();
    await expect(page).toHaveURL(`https://photos.google.com${albumPath}?key=${accessKey}`);
    await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
    await expect(feedback(page)).toContainText("All 2 selected.");
    expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1), photoId(2)]);
    expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
  });
}

test("shared views without native selection controls preserve picks and explain the limitation", async ({ browserSession: { page } }) => {
  await page.goto("https://photos.google.com/share/shared-album/photo/photo-001?key=synthetic-access-key");
  await page.getByRole("button", { name: "Keep photo", exact: false }).click();
  await expect(count(page)).toHaveText("1");
  await page.getByRole("button", { name: "Back to album" }).click();
  await expect(page.getByRole("button", { name: "Select kept photos", exact: false })).toBeVisible();
  await page.locator('[role="checkbox"]').evaluateAll((controls) => controls.forEach((control) => control.remove()));
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("No supported photo selection controls found in this shared view.");
  await expect(count(page)).toHaveText("1");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
});

test("review, remove, collapse, clear and undo affect only the local shortlist", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1), photoId(2), photoId(3)]);
  await page.getByRole("button", { name: "Review shortlist" }).click();
  await expect(page.locator("#photo-shortlist-root #kept-list li")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove photo 2 from shortlist" }).click();
  await expect(count(page)).toHaveText("2");
  await page.getByRole("button", { name: "Collapse shortlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand shortlist, 2 photos kept" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Expand shortlist, 2 photos kept" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(count(page)).toHaveText("0");
  await page.getByRole("button", { name: "Undo clear" }).click();
  await expect(count(page)).toHaveText("2");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
});

test("selects exactly the shortlist across a virtualized album; adding to an album remains manual", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({ photos: Array.from({ length: 100 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`), virtual: true }));
  const ids = [photoId(1), photoId(42), photoId(95)];
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 3 selected.", { timeout: 20000 });
  expect((await page.evaluate(() => window.fixture.selected())).sort()).toEqual(ids.sort());
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
  await page.getByRole("button", { name: "Add to album", exact: true }).click();
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(1);
  await expect(count(page)).toHaveText("3");
});

test("waits for a delayed sixth checkbox confirmation without clicking it twice", async ({ browserSession: { page, seed } }) => {
  const ids = Array.from({ length: 8 }, (_, i) => photoId(i + 1));
  await page.evaluate(() => window.fixture.configure({ delayConfirmationId: "photo-006", confirmationDelayMs: 1600 }));
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 8 selected.");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual(ids);
  expect(await page.evaluate(() => window.fixture.state.selectionClicks)).toEqual(ids);
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
});

test("reacquires every photo control when Google Photos redraws the grid after each selection", async ({ browserSession: { page, seed } }) => {
  const ids = [photoId(1), photoId(3), photoId(5), photoId(8), photoId(12)];
  await page.evaluate(() => window.fixture.configure({ redrawOnSelect: true }));
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 5 selected.");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual(ids);
  expect(await page.evaluate(() => window.fixture.state.selectionClicks)).toEqual(ids);
});

test("scrolls each target into view before clicking a virtualized grid control", async ({ browserSession: { page, seed } }) => {
  const ids = [photoId(1), photoId(13), photoId(25), photoId(46), photoId(87)];
  await page.evaluate(() => window.fixture.configure({
    photos: Array.from({ length: 100 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`),
    virtual: true, refuseOffscreen: true,
  }));
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 5 selected.", { timeout: 20000 });
  expect(await page.evaluate(() => window.fixture.selected())).toEqual(ids);
  expect(await page.evaluate(() => window.fixture.state.selectionClicks)).toEqual(ids);
});

test("selects 87 kept photos once each while virtualized tiles redraw and require scrolling", async ({ browserSession: { page, seed } }) => {
  const ids = Array.from({ length: 87 }, (_, i) => photoId(i + 1));
  await page.evaluate(() => window.fixture.configure({
    photos: Array.from({ length: 100 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`),
    virtual: true, redrawOnSelect: true, refuseOffscreen: true,
  }));
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 87 selected.", { timeout: 25000 });
  expect(await page.evaluate(() => window.fixture.selected())).toEqual(ids);
  expect(await page.evaluate(() => window.fixture.state.selectionClicks)).toEqual(ids);
  await expect(count(page)).toHaveText("87");
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
});

test("a higher native selection count never replaces confirmation of the clicked photo", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({ delayConfirmationId: "photo-001", confirmationDelayMs: 60000 }));
  await seed([photoId(1), photoId(2)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("did not confirm a selection");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1)]);
  expect(await page.evaluate(() => window.fixture.state.selectionClicks)).toEqual([photoId(1)]);
  await expect(count(page)).toHaveText("2");
  await page.getByRole("button", { name: "Check page layout", exact: true }).click();
  const reportText = await page.getByRole("textbox", { name: "Layout report", exact: true }).inputValue();
  const attempt = JSON.parse(reportText).selectionAttempt;
  expect(attempt).toMatchObject({ status: "error", stage: "confirming", total: 2, confirmed: 0, targetState: "unselected" });
  expect(attempt.waitedMs).toBeGreaterThanOrEqual(3000);
  expect(reportText).not.toContain("photo-001");
  expect(reportText).not.toContain("photo-002");
});

test("supports tiles exposing stable data IDs without links", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({ noLinks: true }));
  await seed([photoId(2), photoId(5)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 2 selected.");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(2), photoId(5)]);
});

for (const hrefPrefix of ["./photo/", "photo/"]) {
  test(`resolves base-relative thumbnail links (${hrefPrefix}) without data-ID fallbacks`, async ({ browserSession: { page, seed } }) => {
    await page.evaluate((hrefPrefix) => {
      const base = document.createElement("base");
      base.href = `${location.origin}${location.pathname}/`;
      document.head.prepend(base);
      for (const card of document.querySelectorAll("article[data-id]")) {
        card.querySelector("a").setAttribute("href", hrefPrefix + card.dataset.id);
        card.removeAttribute("data-id");
      }
    }, hrefPrefix);
    await seed([photoId(1), photoId(3)]);
    await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
    await expect(feedback(page)).toContainText("All 2 selected.");
    expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1), photoId(3)]);
  });
}

test("layout diagnostics explain unrecognized controls without exposing private content or modifying selections", async ({ browserSession: { page, seed } }) => {
  const privateValues = ["private-caption-content", "private-access-key", "private-filename.jpg", "private-role-content", "photo-001", "photo-003", "album-a"];
  await seed([photoId(1), photoId(3)]);
  await page.evaluate(() => {
    document.title = "private-caption-content";
    for (const control of document.querySelectorAll('article [role="checkbox"]')) {
      control.removeAttribute("role");
      control.removeAttribute("aria-checked");
      control.setAttribute("aria-label", "private-caption-content");
      control.setAttribute("data-tooltip", "private-filename.jpg");
      control.setAttribute("jsaction", "click:private-access-key;private-role-content:handler");
    }
    for (const link of document.querySelectorAll("article a")) link.href += "?key=private-access-key";
    const unknown = document.createElement("private-role-content");
    unknown.setAttribute("role", "private-role-content");
    unknown.textContent = "private-caption-content";
    document.body.append(unknown);
  });
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("No supported photo selection controls found.");
  await page.locator("article img").first().hover();
  await expect.poll(() => page.evaluate(() => PhotoShortlistDiagnostics.collect(PhotoShortlist.parseRoute(location.href)).hoveredPhoto !== null)).toBe(true);
  await page.getByRole("button", { name: "Check page layout", exact: true }).click();
  const reportText = await page.getByRole("textbox", { name: "Layout report", exact: true }).inputValue();
  const report = JSON.parse(reportText);
  expect(report.view).toBe("album");
  expect(report.counts.recognizedGridItems).toBe(0);
  expect(report.counts.linksMatchingKeptPhotos).toBe(2);
  expect(report.counts.dataIdentifiersMatchingKeptPhotos).toBe(2);
  expect(report.hoveredPhoto).not.toBeNull();
  for (const value of privateValues) expect(reportText).not.toContain(value);
  expect(reportText.length).toBeLessThan(16000);
  await expect(count(page)).toHaveText("2");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => (await axe.run({ include: ["#photo-shortlist-root"] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((violation) => violation.id));
  expect(violations).toEqual([]);
});

test("native controls hidden until hover can select their identified photo without opening the viewer", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1), photoId(3)]);
  await page.locator('article [role="checkbox"]').evaluateAll((controls) => controls.forEach((control) => { control.style.display = "none"; }));
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 2 selected.");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1), photoId(3)]);
  await expect(page).toHaveURL("https://photos.google.com/album/album-a");
  expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
});

test("a native selection hidden until hover still blocks mixing selections", async ({ browserSession: { page, seed } }) => {
  await page.locator('[data-id="photo-004"] [role="checkbox"]').click();
  await page.locator('article [role="checkbox"]').evaluateAll((controls) => controls.forEach((control) => { control.style.display = "none"; }));
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Clear Google Photos’ existing selection first");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(4)]);
});

test("layout report retains a sanitized snapshot of controls that only appear on hover", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1)]);
  await page.evaluate(() => {
    window.fixture.state.refuseClick = true;
    for (const card of document.querySelectorAll("article")) {
      const control = card.querySelector('[role="checkbox"]');
      control.style.display = "none";
      card.onpointerenter = () => { control.style.display = "block"; };
      card.onpointerleave = () => { control.style.display = "none"; };
    }
  });
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("did not confirm a selection");
  await page.locator("article img").first().hover();
  await expect.poll(() => page.evaluate(() => PhotoShortlistDiagnostics.collect(PhotoShortlist.parseRoute(location.href)).hoveredPhoto?.controls.some((control) => control.role === "checkbox" && control.visible) || false)).toBe(true);
  await page.getByRole("button", { name: "Check page layout", exact: true }).click();
  const report = JSON.parse(await page.getByRole("textbox", { name: "Layout report", exact: true }).inputValue());
  expect(report.counts.visibleReadableSelectionControls).toBe(0);
  expect(report.hoveredPhoto.controls.some((control) => control.role === "checkbox" && control.visible)).toBe(true);
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
});

test("refuses to mix an unrelated native selection with the shortlist", async ({ browserSession: { page, seed } }) => {
  await page.locator('[data-id="photo-004"] [role="checkbox"]').click();
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Clear Google Photos’ existing selection first");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(4)]);
});

for (const hiddenBy of ["visibility", "opacity", "offscreen", "clipping", "inert"]) {
  test(`an inactive selection toolbar hidden by ${hiddenBy} does not block selecting kept photos`, async ({ browserSession: { page, seed } }) => {
    await seed([photoId(1), photoId(3)]);
    await page.evaluate((hiddenBy) => {
      const container = document.createElement("div");
      container.id = "inactive-selection-toolbar";
      container.style.cssText = "position:fixed;top:80px;left:400px;width:240px;height:56px";
      container.innerHTML = '<div role="toolbar"><button aria-label="Clear selection">Close</button><span>1 selected</span></div>';
      if (hiddenBy === "visibility") container.style.visibility = "hidden";
      if (hiddenBy === "opacity") container.style.opacity = "0";
      if (hiddenBy === "offscreen") container.style.transform = "translateY(-200px)";
      if (hiddenBy === "inert") container.inert = true;
      if (hiddenBy === "clipping") {
        container.style.height = "0";
        container.style.overflow = "hidden";
      }
      document.body.append(container);
    }, hiddenBy);
    // These controls still have layout boxes, which the previous detector
    // incorrectly treated as proof of an active native selection.
    expect(await page.locator('#inactive-selection-toolbar button').evaluate((button) => button.getClientRects().length)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
    await expect(feedback(page)).toContainText("All 2 selected.");
    expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1), photoId(3)]);
    expect(await page.evaluate(() => window.fixture.state.addCalls)).toBe(0);
  });
}

test("a checked preference outside photo tiles is not a native photo selection", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1)]);
  await page.evaluate(() => {
    const preference = document.createElement("aside");
    preference.innerHTML = '<label><input type="checkbox" checked>Show details</label>';
    document.body.append(preference);
  });
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("All 1 selected.");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1)]);
  await expect(page.getByLabel("Show details", { exact: true })).toBeChecked();
});

test("a visible Clear selection control protects a selected photo virtualized out of the grid", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => {
    window.fixture.configure({
      photos: Array.from({ length: 100 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`),
      virtual: true, selected: new Set(['photo-099']),
    });
    document.getElementById("native-count").textContent = "";
    const clear = document.createElement("button");
    clear.setAttribute("aria-label", "Clear selection");
    clear.textContent = "Close";
    document.querySelector("header").append(clear);
  });
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Clear Google Photos’ existing selection first");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(99)]);
});

test("detects a preexisting selection even when its tile is off screen", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({
    photos: Array.from({ length: 100 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`),
    virtual: true, selected: new Set(['photo-099']),
  }));
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Clear Google Photos’ existing selection first");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(99)]);
});

test("a selected photo outside the viewport still blocks even without a toolbar indicator", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => {
    window.fixture.configure({
      photos: Array.from({ length: 64 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}`),
      selected: new Set(['photo-064']),
    });
    document.getElementById("native-count").textContent = "";
  });
  expect(await page.locator('[data-id="photo-064"]').evaluate((tile) => tile.getBoundingClientRect().top > innerHeight)).toBe(true);
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Clear Google Photos’ existing selection first");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(64)]);
});

test("does not report success when Google Photos ignores a click", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({ refuseClick: true }));
  await seed([photoId(1)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("did not confirm a selection");
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
});

test("reports missing photos honestly and preserves the shortlist", async ({ browserSession: { page, seed } }) => {
  await seed([photoId(1), "missing-photo"]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(feedback(page)).toContainText("Selected 1 of 2.", { timeout: 15000 });
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([photoId(1)]);
  await expect(count(page)).toHaveText("2");
});

test("cancellation stops further clicks and leaves confirmed native selections visible", async ({ browserSession: { page, seed } }) => {
  const ids = Array.from({ length: 70 }, (_, i) => photoId(i + 1));
  await page.evaluate((photos) => window.fixture.configure({ photos, virtual: true }), ids);
  await seed(ids);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect.poll(() => page.evaluate(() => window.fixture.selected().length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop selecting" }).click();
  await expect(feedback(page)).toContainText("Stopped.");
  const stoppedCount = await page.evaluate(() => window.fixture.selected().length);
  expect(stoppedCount).toBeLessThan(70);
  await expect(page.getByRole("button", { name: "Select kept photos", exact: false })).toBeEnabled();
  expect(await page.evaluate(() => window.fixture.selected().length)).toBe(stoppedCount);
});

test("unexpected viewer navigation aborts selection instead of continuing on another page", async ({ browserSession: { page, seed } }) => {
  await page.evaluate(() => window.fixture.configure({ navigateOnClick: true }));
  await seed([photoId(1), photoId(2)]);
  await page.getByRole("button", { name: "Select kept photos", exact: false }).click();
  await expect(page).toHaveURL(/\/photo\/photo-001$/);
  await expect(page.getByRole("button", { name: "Keep photo", exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.fixture.selected())).toEqual([]);
});

test("simultaneous keeps from two tabs preserve both photos", async ({ browserSession: { context, page } }) => {
  const second = await context.newPage();
  await second.goto("https://photos.google.com/album/album-a/photo/photo-002");
  await navigate(page, "/album/album-a/photo/photo-001");
  await expect(page.getByRole("button", { name: "Keep photo", exact: false })).toBeEnabled();
  await expect(second.getByRole("button", { name: "Keep photo", exact: false })).toBeEnabled();
  await Promise.all([
    page.getByRole("button", { name: "Keep photo", exact: false }).click(),
    second.getByRole("button", { name: "Keep photo", exact: false }).click(),
  ]);
  await expect(count(page)).toHaveText("2");
  await expect(count(second)).toHaveText("2");
});

test("dock and popup pass automated accessibility checks; capture light and dark UI", async ({ browserSession: { page, context, seed } }, testInfo) => {
  await seed([photoId(1), photoId(3), photoId(5)]);
  const audit = async (target, include) => {
    await target.evaluate(axeSource);
    const result = await target.evaluate(async (include) => window.axe.run(include ? { include: [include] } : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }), include);
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  };
  await audit(page, "#photo-shortlist-root");
  await page.screenshot({ path: testInfo.outputPath("album.png") });
  await navigate(page, "/album/album-a/photo/photo-003");
  await expect(page.getByRole("button", { name: "Keep photo", exact: false })).toHaveAttribute("aria-pressed", "true");
  await audit(page, "#photo-shortlist-root");
  await page.screenshot({ path: testInfo.outputPath("viewer.png") });
  await page.locator("#photo-shortlist-root summary").click();
  await expect(page.getByLabel("Panel position", { exact: true })).toHaveValue("bottom-left");
  await expect(page.getByText("Created by kutsin@gmail.com", { exact: false })).toBeVisible();
  await audit(page, "#photo-shortlist-root");
  await page.screenshot({ path: testInfo.outputPath("settings.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await audit(page, "#photo-shortlist-root");
  await page.screenshot({ path: testInfo.outputPath("settings-dark.png") });
  await page.locator("#photo-shortlist-root summary").click();
  await audit(page, "#photo-shortlist-root");
  await page.screenshot({ path: testInfo.outputPath("viewer-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
  const bounds = await page.locator("#photo-shortlist-root").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  const popup = await context.newPage();
  await popup.goto("https://shortlist.test/popup.html");
  await expect(popup.getByRole("heading", { name: "Find the keepers." })).toBeVisible();
  await expect(popup.getByText("Created by kutsin@gmail.com", { exact: false })).toBeVisible();
  await expect(popup.getByText("Built with assistance from ChatGPT Codex.", { exact: false })).toBeVisible();
  await audit(popup);
  await popup.setViewportSize({ width: 340, height: 580 });
  expect(await popup.locator("main").evaluate((main) => main.getBoundingClientRect().bottom)).toBeLessThanOrEqual(600);
  await popup.screenshot({ path: testInfo.outputPath("popup.png") });
});
