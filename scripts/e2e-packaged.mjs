import { _electron as electron } from 'playwright-core';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve('.');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedVersion = packageJson.version;
const out = path.join(root, 'analysis');
const testAppData = path.join(out, 'test-appdata');
const executablePath = path.join(root, 'dist', 'win-unpacked', 'Snapleaf.exe');
fs.mkdirSync(testAppData, { recursive: true });
fs.mkdirSync(out, { recursive: true });
if (!fs.existsSync(executablePath)) throw new Error(`Missing packaged executable: ${executablePath}`);

const errors = [];
// An IDE or agent shell can export ELECTRON_RUN_AS_NODE, which makes the
// Electron binary run as plain Node and exit before a debugger port appears.
// A private user-data directory keeps the run independent of an installed
// copy of Snapleaf that may already be running and holding the single
// instance lock.
const childEnv = { ...process.env, APPDATA: testAppData, SNAPLEAF_E2E: '1' };
delete childEnv.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${path.join(testAppData, 'user-data')}`],
  env: childEnv
});
const watch = (page, label) => {
  page.on('pageerror', (error) => errors.push(`[${label}] ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${label}] console: ${message.text()}`);
  });
};

try {
  const home = await app.firstWindow();
  watch(home, 'home');
  await home.waitForSelector('text=Capture it. Mark it. Share it.', { timeout: 20000 });
  await delay(700);
  await home.evaluate(async () => {
    const settings = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({
      ...settings,
      capture: { ...settings.capture, lastRegion: null }
    });
  });
  await delay(300);
  await home.screenshot({ path: path.join(out, 'packaged-home.png') });
  console.log('PACKAGED_HOME_OK', await home.title());
  const updateStatus = await home.evaluate(async () => window.snapleaf.updates.status());
  console.log('PACKAGED_UPDATE_STATUS', JSON.stringify(updateStatus));
  if (updateStatus.currentVersion !== expectedVersion) {
    throw new Error(`Packaged update API returned ${updateStatus.currentVersion}, expected ${expectedVersion}`);
  }

  await home.evaluate(() => window.snapleaf.app.openSettings());
  let settings = null;
  for (let index = 0; index < 80 && !settings; index += 1) {
    settings = app.windows().find((page) => page.url().includes('settings')) ?? null;
    if (!settings) await delay(150);
  }
  if (!settings) throw new Error('Packaged settings window did not open');
  watch(settings, 'settings');
  await settings.waitForSelector('.settings-nav', { timeout: 15000 });
  await settings.getByRole('button', { name: /^Developer$/ }).click();
  await settings.waitForSelector('.developer-profile', { timeout: 5000 });
  await delay(400);
  console.log('PACKAGED_DEVELOPER', await settings.locator('.developer-profile h2').textContent());
  await settings.screenshot({ path: path.join(out, 'packaged-developer.png') });
  await settings.getByRole('button', { name: /^Shortcuts$/ }).click();
  await delay(400);
  await settings.evaluate(async () => {
    const current = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({
      ...current,
      hotkeys: {
        ...current.hotkeys,
        capture: { enabled: true, accelerator: 'PrintScreen' }
      }
    });
  });
  await delay(500);
  const captureRow = settings.locator('.hotkey-row').first();
  await captureRow.getByRole('button', { name: 'Change', exact: true }).click();
  await delay(350);
  await settings.keyboard.press('PrintScreen');
  await delay(650);
  const recorded = await captureRow.locator('kbd').textContent();
  console.log('PACKAGED_HOTKEY_RECORDED', JSON.stringify(recorded));
  if (!recorded?.includes('PrtSc')) throw new Error(`Packaged PrintScreen recording failed: ${recorded}`);
  // Overlay windows are pre-created hidden, so only a visible one means a capture started.
  const captureVisible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((win) => win.isVisible() && win.webContents.getURL().includes('overlay'))
  );
  if (captureVisible) {
    throw new Error('Packaged PrintScreen recording started a capture');
  }
  await settings.close();
  await delay(300);

  await home.click('button:has-text("Capture a region")');
  let overlay = null;
  for (let index = 0; index < 80 && !overlay; index += 1) {
    overlay = app.windows().find((page) => page.url().includes('overlay')) ?? null;
    if (!overlay) await delay(150);
  }
  if (!overlay) throw new Error('Packaged overlay did not open');
  watch(overlay, 'overlay');
  await overlay.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(500);
  await overlay.mouse.move(300, 300);
  await overlay.mouse.down();
  await overlay.mouse.move(900, 650, { steps: 10 });
  await overlay.mouse.up();
  await delay(500);
  await overlay.getByRole('button', { name: 'Pen', exact: true }).click();
  await overlay.mouse.move(420, 380);
  await overlay.mouse.down();
  for (let index = 1; index <= 10; index += 1) {
    await overlay.mouse.move(420 + index * 9, 380 + Math.sin(index) * 20);
    await delay(15);
  }
  await overlay.mouse.up();
  await delay(300);
  await overlay.getByRole('button', { name: 'Text', exact: true }).click();
  await overlay.mouse.click(500, 480);
  await overlay.waitForSelector('textarea.inline-text-editor', { timeout: 5000 });
  const inlineText = overlay.locator('textarea.inline-text-editor');
  await inlineText.click();
  await inlineText.pressSequentially('Packaged note', { delay: 20 });
  const value = await inlineText.inputValue();
  console.log('PACKAGED_INLINE_TEXT', JSON.stringify(value));
  if (value !== 'Packaged note') throw new Error(`Packaged text was truncated: ${value}`);
  await overlay.keyboard.press('Control+Enter');
  await delay(400);

  const inlineCount = () => overlay.locator('.inline-rail').getAttribute('data-markup-count');
  const beforeSteps = Number(await inlineCount());
  await overlay.getByRole('button', { name: 'Step', exact: true }).click();
  await overlay.mouse.click(780, 590);
  await delay(200);
  await overlay.mouse.click(820, 620);
  await delay(300);
  const addedSteps = Number(await inlineCount());
  console.log('PACKAGED_STEP_COUNT', beforeSteps, addedSteps);
  if (addedSteps !== beforeSteps + 2) throw new Error(`Packaged step tool failed: ${beforeSteps} -> ${addedSteps}`);
  await overlay.getByRole('button', { name: 'Eraser', exact: true }).click();
  await overlay.mouse.click(780, 590);
  await delay(300);
  const erasedStep = Number(await inlineCount());
  console.log('PACKAGED_STEP_ERASE', erasedStep);
  if (erasedStep !== addedSteps - 1) throw new Error(`Packaged eraser failed: ${addedSteps} -> ${erasedStep}`);
  await overlay.getByRole('button', { name: 'Undo', exact: true }).click();
  await delay(300);
  const restoredStep = Number(await inlineCount());
  console.log('PACKAGED_STEP_UNDO', restoredStep);
  if (restoredStep !== addedSteps) throw new Error(`Packaged undo failed: ${erasedStep} -> ${restoredStep}`);

  await overlay.screenshot({ path: path.join(out, 'packaged-overlay.png') });
  await overlay.getByRole('button', { name: 'Edit', exact: true }).click();

  let editor = null;
  for (let index = 0; index < 80 && !editor; index += 1) {
    editor = app.windows().find((page) => page.url().includes('editor')) ?? null;
    if (!editor) await delay(150);
  }
  if (!editor) throw new Error('Packaged editor did not open');
  watch(editor, 'editor');
  await editor.waitForSelector('canvas.editor-canvas', { timeout: 15000 });
  await delay(1000);
  await editor.screenshot({ path: path.join(out, 'packaged-editor.png') });
  console.log('PACKAGED_EDITOR_OK', await editor.title());

  const data = await app.evaluate(({ app: electronApp }) => ({
    version: electronApp.getVersion(),
    packaged: electronApp.isPackaged,
    name: electronApp.getName(),
    userData: electronApp.getPath('userData')
  }));
  console.log('PACKAGED_APP', JSON.stringify(data));
} finally {
  await app.close();
  console.log('PACKAGED_ERRORS', errors.length);
  for (const error of errors) console.log(error);
}
