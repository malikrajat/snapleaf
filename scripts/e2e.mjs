import { _electron as electron } from 'playwright-core';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve('.');
const out = path.join(root, 'analysis');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const logs = [];
let updateFeedServer = null;

function watch(page, label) {
  page.on('pageerror', (error) => {
    errors.push(`[${label}] ${error.stack || error.message}`);
  });
  page.on('console', (message) => {
    logs.push(`[${label}] ${message.type()}: ${message.text()}`);
    if (message.type() === 'error') errors.push(`[${label}] console: ${message.text()}`);
  });
}

async function waitForWindow(app, part, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = app.windows().find((page) => page.url().includes(part));
    if (found) return found;
    await delay(120);
  }
  throw new Error(`Timed out waiting for window containing ${part}. Open: ${app.windows().map((p) => p.url()).join(', ')}`);
}

async function markupCount(page) {
  const text = await page.locator('.editor-status').textContent();
  const match = /(\d+) markup/.exec(text ?? '');
  if (!match) throw new Error(`Could not read markup count: ${text}`);
  return Number(match[1]);
}

async function canvasAlphaCheck(page, label) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.editor-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return {
      width: canvas.width,
      height: canvas.height,
      corner: ctx.getImageData(2, 2, 1, 1).data[3],
      center: ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3]
    };
  });
  console.log(`${label}_ALPHA`, JSON.stringify(result));
  if (!result || result.corner !== 0 || result.center !== 255) {
    throw new Error(`${label} capture did not preserve a transparent, custom-shaped crop: ${JSON.stringify(result)}`);
  }
}

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, SNAPLEAF_E2E: '1' }
});
app.process().stdout?.on('data', (data) => logs.push(`[main] ${data.toString().trim()}`));
app.process().stderr?.on('data', (data) => logs.push(`[main:err] ${data.toString().trim()}`));

try {
  const home = await app.firstWindow();
  watch(home, 'home');
  await home.waitForLoadState('domcontentloaded');
  await home.waitForSelector('text=Capture it. Mark it. Share it.', { timeout: 15000 });
  await delay(500);
  await home.evaluate(async () => {
    const settings = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({
      ...settings,
      capture: { ...settings.capture, lastRegion: null },
      upload: { ...settings.upload, localServer: true },
      hotkeys: {
        ...settings.hotkeys,
        capture: { enabled: true, accelerator: 'PrintScreen' }
      }
    });
  });
  await delay(300);
  await home.screenshot({ path: path.join(out, 'e2e-home.png') });

  await home.click('button:has-text("Capture a region")');
  const overlay = await waitForWindow(app, 'overlay');
  watch(overlay, 'overlay');
  await overlay.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(700);

  await overlay.mouse.move(380, 360);
  await overlay.mouse.down();
  for (let index = 1; index <= 12; index += 1) {
    await overlay.mouse.move(380 + index * 55, 360 + index * 28);
    await delay(18);
  }
  await overlay.mouse.up();
  await delay(500);
  await overlay.screenshot({ path: path.join(out, 'e2e-overlay-selection.png') });
  console.log('INLINE_RAIL', await overlay.locator('.inline-rail').isVisible());

  // The shape switcher must stay visible after the first rectangle and reshape
  // the existing box in place. Freehand needs a drag, so it waits for one and
  // Escape must leave the current selection untouched.
  const shapeBar = overlay.locator('.selection-shapebar');
  console.log('SHAPE_BAR_AFTER_SELECT', await shapeBar.isVisible());
  if (!(await shapeBar.isVisible())) throw new Error('Selection shape bar disappeared after drawing');
  await overlay.getByRole('button', { name: 'Ellipse selection', exact: true }).click();
  await delay(250);
  const ellipseShape = await overlay.locator('.selection-shape-button.is-active').textContent();
  console.log('SHAPE_BAR_ELLIPSE', JSON.stringify(ellipseShape));
  if (!ellipseShape?.includes('Circle')) throw new Error('Circle selection did not activate');
  await overlay.getByRole('button', { name: 'Rectangle selection', exact: true }).click();
  await delay(250);
  await overlay.getByRole('button', { name: 'Freehand lasso selection', exact: true }).click();
  await delay(200);
  const pendingHint = await overlay.locator('.capture-hint').textContent();
  console.log('SHAPE_BAR_PENDING_HINT', JSON.stringify(pendingHint));
  if (!pendingHint?.includes('freehand')) throw new Error('Freehand selection did not explain the next drag');
  await overlay.keyboard.press('Escape');
  await delay(250);
  const restoredShape = await overlay.locator('.selection-shape-button.is-active').textContent();
  console.log('SHAPE_BAR_RESTORED', JSON.stringify(restoredShape));
  if (!restoredShape?.includes('Rect')) throw new Error('Escape did not keep the rectangle selection');
  await overlay.screenshot({ path: path.join(out, 'e2e-overlay-shapebar.png') });

  // A single click with Pen used to crash on a one-point path. Exercise both
  // the dot and a real freehand stroke.
  await overlay.getByRole('button', { name: 'Pen', exact: true }).click();
  await overlay.mouse.click(500, 450);
  await delay(200);
  await overlay.mouse.move(480, 470);
  await overlay.mouse.down();
  for (let index = 1; index <= 10; index += 1) {
    await overlay.mouse.move(480 + index * 7, 470 + Math.sin(index) * 18);
    await delay(15);
  }
  await overlay.mouse.up();
  await delay(300);
  await overlay.getByRole('button', { name: 'Clear all markup', exact: true }).click();
  await delay(250);
  await overlay.getByRole('button', { name: 'Undo', exact: true }).click();
  await delay(300);
  await overlay.screenshot({ path: path.join(out, 'e2e-overlay-pen.png') });

  await overlay.getByRole('button', { name: 'Arrow', exact: true }).click();
  await delay(200);
  await overlay.mouse.move(470, 450);
  await overlay.mouse.down();
  await overlay.mouse.move(760, 540, { steps: 10 });
  await overlay.mouse.up();
  await delay(500);

  await overlay.getByRole('button', { name: 'Text', exact: true }).click();
  await overlay.mouse.click(600, 500);
  await overlay.waitForSelector('textarea.inline-text-editor', { timeout: 5000 });
  const inlineText = overlay.locator('textarea.inline-text-editor');
  await inlineText.click();
  await inlineText.pressSequentially('Inline note', { delay: 25 });
  const inlineValue = await inlineText.inputValue();
  console.log('INLINE_TEXT', JSON.stringify(inlineValue));
  if (inlineValue !== 'Inline note') throw new Error(`Inline text was truncated: ${inlineValue}`);
  await overlay.keyboard.press('Control+Enter');
  await delay(400);

  await overlay.getByRole('button', { name: 'Box', exact: true }).click();
  await overlay.mouse.move(500, 480);
  await overlay.mouse.down();
  await overlay.mouse.move(720, 600, { steps: 8 });
  await overlay.mouse.up();
  await delay(300);
  await overlay.getByRole('button', { name: 'Line', exact: true }).click();
  await overlay.mouse.move(700, 460);
  await overlay.mouse.down();
  await overlay.mouse.move(860, 610, { steps: 8 });
  await overlay.mouse.up();
  await delay(300);
  await overlay.screenshot({ path: path.join(out, 'e2e-overlay-dotted.png') });

  await overlay.getByRole('button', { name: 'Pixelate', exact: true }).click();
  await overlay.mouse.move(500, 430);
  await overlay.mouse.down();
  await overlay.mouse.move(650, 500, { steps: 8 });
  await overlay.mouse.up();
  await delay(600);
  await overlay.getByRole('button', { name: 'Undo', exact: true }).click();
  await delay(400);

  // Inline numbered steps: add two, erase only step 1, then undo it.
  const inlineCount = () => overlay.locator('.inline-rail').getAttribute('data-markup-count');
  const inlineStart = Number(await inlineCount());
  await overlay.getByRole('button', { name: 'Step', exact: true }).click();
  await overlay.mouse.click(940, 620);
  await delay(200);
  await overlay.mouse.click(1000, 640);
  await delay(300);
  const inlineAdded = Number(await inlineCount());
  console.log('INLINE_STEP_COUNT', inlineStart, inlineAdded);
  if (inlineAdded !== inlineStart + 2) throw new Error(`Inline step tool did not add two steps: ${inlineStart} -> ${inlineAdded}`);
  await overlay.getByRole('button', { name: 'Eraser', exact: true }).click();
  await overlay.mouse.click(940, 620);
  await delay(300);
  const inlineErased = Number(await inlineCount());
  console.log('INLINE_STEP_ERASE', inlineErased);
  if (inlineErased !== inlineAdded - 1) throw new Error(`Inline eraser did not remove one step: ${inlineAdded} -> ${inlineErased}`);
  await overlay.getByRole('button', { name: 'Undo', exact: true }).click();
  await delay(300);
  const inlineRestored = Number(await inlineCount());
  console.log('INLINE_STEP_UNDO', inlineRestored);
  if (inlineRestored !== inlineAdded) throw new Error(`Inline undo did not restore the step: ${inlineErased} -> ${inlineRestored}`);

  await overlay.screenshot({ path: path.join(out, 'e2e-overlay-annotated.png') });
  console.log('INLINE_ACTIONS', await overlay.locator('.inline-actionbar').isVisible());

  await overlay.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = await waitForWindow(app, 'editor');
  watch(editor, 'editor');
  await editor.waitForSelector('canvas.editor-canvas', { timeout: 15000 });
  await delay(1200);
  await editor.screenshot({ path: path.join(out, 'e2e-editor.png') });

  const canvas = editor.locator('canvas.editor-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  // Single-point Pen click in the full editor (the old crash path).
  await editor.getByRole('button', { name: /^Pen$/ }).click();
  await editor.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.42);
  await delay(300);

  await editor.getByRole('button', { name: /Arrow/ }).click();
  await delay(300);
  console.log('TOOL_ARROW_CLASS', await canvas.getAttribute('class'));
  await editor.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await editor.mouse.down();
  for (let index = 1; index <= 12; index += 1) {
    await editor.mouse.move(box.x + box.width * (0.25 + index * 0.03), box.y + box.height * (0.3 + index * 0.015));
    await delay(25);
  }
  await editor.mouse.up();
  await delay(600);
  console.log('STATUS_ARROW', await editor.locator('.editor-status').textContent());
  await editor.screenshot({ path: path.join(out, 'e2e-editor-arrow.png') });

  await editor.getByRole('button', { name: /^Text$/ }).click();
  await delay(400);
  console.log('TOOL_TEXT_CLASS', await canvas.getAttribute('class'));
  const textBox = await canvas.boundingBox();
  if (!textBox) throw new Error('Canvas lost its bounding box');
  console.log('TEXT_BOX', JSON.stringify(textBox));
  await editor.mouse.click(textBox.x + textBox.width * 0.35, textBox.y + textBox.height * 0.62);
  await editor.waitForSelector('textarea.text-editor', { timeout: 5000 });
  const editorText = editor.locator('textarea.text-editor');
  await editorText.click();
  await editorText.pressSequentially('Looks good!', { delay: 20 });
  const editorValue = await editorText.inputValue();
  console.log('EDITOR_TEXT', JSON.stringify(editorValue));
  if (editorValue !== 'Looks good!') throw new Error(`Editor text was truncated: ${editorValue}`);
  await editor.keyboard.press('Control+Enter');
  await delay(400);
  console.log('STATUS_TEXT', await editor.locator('.editor-status').textContent());

  // Numbered steps are independent annotations. Place two, erase the first,
  // then undo: the second step and all earlier markup must survive.
  const beforeSteps = await markupCount(editor);
  await editor.getByRole('button', { name: /^Step$/ }).click();
  await delay(200);
  const stepBox = await canvas.boundingBox();
  if (!stepBox) throw new Error('Canvas lost its bounding box');
  const stepOne = { x: stepBox.x + stepBox.width * 0.2, y: stepBox.y + stepBox.height * 0.2 };
  await editor.mouse.click(stepOne.x, stepOne.y);
  await delay(250);
  await editor.mouse.click(stepBox.x + stepBox.width * 0.78, stepBox.y + stepBox.height * 0.2);
  await delay(250);
  const addedSteps = await markupCount(editor);
  console.log('STEP_COUNT', beforeSteps, addedSteps);
  if (addedSteps !== beforeSteps + 2) throw new Error(`Step tool did not add two steps: ${beforeSteps} -> ${addedSteps}`);
  await editor.screenshot({ path: path.join(out, 'e2e-editor-steps.png') });

  await editor.getByRole('button', { name: /^Eraser$/ }).click();
  await editor.mouse.click(stepOne.x, stepOne.y);
  await delay(300);
  const erasedStep = await markupCount(editor);
  console.log('STEP_ERASE', erasedStep);
  if (erasedStep !== beforeSteps + 1) throw new Error(`Eraser did not remove one step: ${addedSteps} -> ${erasedStep}`);
  await editor.getByRole('button', { name: /Undo/ }).first().click();
  await delay(300);
  const restoredStep = await markupCount(editor);
  console.log('STEP_UNDO', restoredStep);
  if (restoredStep !== addedSteps) throw new Error(`Undo did not restore the erased step: ${erasedStep} -> ${restoredStep}`);

  await editor.getByRole('button', { name: /Pixelate/ }).click();
  await delay(300);
  const pixelBox = await canvas.boundingBox();
  if (!pixelBox) throw new Error('Canvas lost its bounding box');
  await editor.mouse.move(pixelBox.x + pixelBox.width * 0.55, pixelBox.y + pixelBox.height * 0.45);
  await editor.mouse.down();
  await editor.mouse.move(pixelBox.x + pixelBox.width * 0.72, pixelBox.y + pixelBox.height * 0.6, { steps: 8 });
  await editor.mouse.up();
  await delay(600);
  await editor.screenshot({ path: path.join(out, 'e2e-editor-annotated.png') });

  await editor.getByRole('button', { name: /^Eraser$/ }).click();
  await delay(200);
  const beforeTextErase = await markupCount(editor);
  await editor.mouse.click(textBox.x + textBox.width * 0.35, textBox.y + textBox.height * 0.62);
  await delay(400);
  const erasedText = await markupCount(editor);
  console.log('ERASE_STATUS', beforeTextErase, erasedText);
  if (erasedText !== beforeTextErase - 1) throw new Error(`Eraser did not remove exactly one annotation: ${beforeTextErase} -> ${erasedText}`);
  await editor.getByRole('button', { name: /Undo/ }).first().click();
  await delay(300);
  const restoredText = await markupCount(editor);
  console.log('UNDO_ERASE_STATUS', restoredText);
  if (restoredText !== beforeTextErase) throw new Error(`Undo did not restore the erased annotation: ${erasedText} -> ${restoredText}`);

  const undo = editor.getByRole('button', { name: /Undo/ }).first();
  await undo.click();
  await delay(250);
  const redo = editor.getByRole('button', { name: /Redo/ }).first();
  await redo.click();
  await delay(250);

  const savePath = path.join(out, 'e2e-save.png');
  fs.rmSync(savePath, { force: true });
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, savePath);
  await editor.getByRole('button', { name: /^Save$/ }).click();
  await delay(1200);
  console.log('SAVE_OK', fs.existsSync(savePath), fs.existsSync(savePath) ? fs.statSync(savePath).size : 0);

  await editor.getByRole('button', { name: /^Copy$/ }).click();
  await delay(700);
  const clipboardTypes = await app.evaluate(async ({ clipboard }) =>
    (await clipboard.read()).flatMap((item) => item.types)
  );
  console.log('CLIPBOARD_TYPES', JSON.stringify(clipboardTypes));

  await editor.getByRole('button', { name: /^Share$/ }).click();
  const upload = await waitForWindow(app, 'upload');
  watch(upload, 'upload');
  await upload.waitForSelector('.upload-preview-card img', { timeout: 15000 });
  await delay(1200);
  console.log(
    'UPLOAD_LAYOUT',
    JSON.stringify(
      await upload.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
        };
        const main = document.querySelector('.upload-main');
        return {
          innerWidth,
          innerHeight,
          columns: main ? getComputedStyle(main).gridTemplateColumns : null,
          main: rect('.upload-main'),
          preview: rect('.upload-preview-card'),
          details: rect('.upload-details'),
          qr: rect('.qr-card')
        };
      })
    )
  );
  await upload.screenshot({ path: path.join(out, 'e2e-upload.png') });

  const pageUrl = await upload.locator('.link-row code').first().textContent();
  const server = await upload.evaluate(async () => window.snapleaf.upload.serverInfo());
  const api = await fetch(`${server.localUrl}/api/images`).then((response) => response.json());
  const pageHtml = await fetch(pageUrl).then((response) => response.text());
  const galleryHtml = await fetch(server.localUrl).then((response) => response.text());
  console.log('SHARE_URL', pageUrl);
  console.log('UPLOAD_API', JSON.stringify(api));
  console.log('SHARE_PAGE', pageHtml.includes('og:image') && pageHtml.includes('Shared with Snapleaf'));
  console.log('GALLERY_PAGE', galleryHtml.includes('Snapleaf gallery'));
  await upload.getByRole('button', { name: /Copy link/ }).click();
  await delay(400);
  const clipText = await app.evaluate(({ clipboard }) => clipboard.readText());
  console.log('CLIPBOARD_TEXT', clipText);

  await upload.close();
  await delay(300);
  await editor.close();
  await delay(500);

  const homeAgain = await app.firstWindow();
  await homeAgain.click('button:has-text("Gallery")');
  const gallery = await waitForWindow(app, 'gallery');
  watch(gallery, 'gallery');
  await gallery.waitForLoadState('domcontentloaded');
  await delay(800);
  await gallery.screenshot({ path: path.join(out, 'e2e-gallery.png') });
  await gallery.close();
  await delay(300);

  await homeAgain.click('button:has-text("Settings")');
  const settings = await waitForWindow(app, 'settings');
  watch(settings, 'settings');
  await settings.waitForLoadState('domcontentloaded');
  await delay(600);
  await settings.screenshot({ path: path.join(out, 'e2e-settings.png') });
  await settings.getByRole('button', { name: /Dark/ }).click();
  await delay(1100);
  const theme = await settings.evaluate(async () => (await window.snapleaf.settings.get()).general.theme);
  console.log('THEME_PERSISTED', theme);
  await settings.getByRole('button', { name: /Shortcuts/ }).click();
  await delay(500);
  await settings.evaluate(async () => {
    const current = await window.snapleaf.settings.get();
    if (current.hotkeys.capture.accelerator !== 'PrintScreen' || !current.hotkeys.capture.enabled) {
      await window.snapleaf.settings.update({
        ...current,
        hotkeys: {
          ...current.hotkeys,
          capture: { enabled: true, accelerator: 'PrintScreen' }
        }
      });
    }
  });
  await delay(500);
  const captureHotkeyRow = settings.locator('.hotkey-row').first();
  await captureHotkeyRow.getByRole('button', { name: 'Change', exact: true }).click();
  await delay(350);
  const listeningText = await captureHotkeyRow.locator('kbd').textContent();
  console.log('HOTKEY_LISTENING', JSON.stringify(listeningText));
  if (!listeningText?.includes('Press a shortcut')) throw new Error(`Shortcut recorder did not start: ${listeningText}`);
  await settings.keyboard.press('PrintScreen');
  await delay(650);
  const recordedHotkey = await captureHotkeyRow.locator('kbd').textContent();
  console.log('HOTKEY_RECORDED', JSON.stringify(recordedHotkey));
  if (!recordedHotkey?.includes('PrtSc')) throw new Error(`PrintScreen was not recorded: ${recordedHotkey}`);
  if (app.windows().some((page) => page.url().includes('overlay'))) {
    throw new Error('Recording PrintScreen started a capture instead of reaching the recorder');
  }
  await captureHotkeyRow.getByRole('button', { name: 'Change', exact: true }).click();
  await delay(350);
  await settings.keyboard.down('Shift');
  await delay(150);
  const modifierPreview = await captureHotkeyRow.locator('kbd').textContent();
  console.log('HOTKEY_PREVIEW', JSON.stringify(modifierPreview));
  if (!modifierPreview?.includes('Shift')) throw new Error('Modifier preview did not update');
  await settings.keyboard.up('Shift');
  await settings.keyboard.press('Escape');
  await delay(300);
  await settings.screenshot({ path: path.join(out, 'e2e-settings-shortcuts.png') });
  await settings.getByRole('button', { name: /^Developer$/ }).click();
  await delay(500);
  console.log(
    'DEVELOPER_SECTION',
    JSON.stringify({
      name: await settings.locator('.developer-profile h2').textContent(),
      references: await settings.locator('.reference-card').count(),
      services: await settings.locator('.developer-service').count()
    })
  );
  await settings.screenshot({ path: path.join(out, 'e2e-settings-developer.png') });
  await settings.getByRole('button', { name: /^Advanced$/ }).click();
  await delay(500);
  await settings.screenshot({ path: path.join(out, 'e2e-settings-advanced.png') });
  await settings.getByRole('button', { name: /General/ }).click();
  await delay(300);
  await settings.getByRole('button', { name: /System/ }).click();
  await delay(900);
  await settings.close();
  await delay(300);

  await homeAgain.locator('.recent-card').first().click();
  const cropEditor = await waitForWindow(app, 'editor');
  watch(cropEditor, 'crop-editor');
  await cropEditor.waitForSelector('canvas.editor-canvas', { timeout: 15000 });
  await delay(1000);
  const beforeDimensions = await cropEditor.locator('.editor-title span').first().textContent();
  await cropEditor.getByRole('button', { name: /^Crop$/ }).click();
  await delay(250);
  const cropCanvas = cropEditor.locator('canvas.editor-canvas');
  const cropBox = await cropCanvas.boundingBox();
  if (!cropBox) throw new Error('Crop canvas has no bounding box');
  await cropEditor.mouse.move(cropBox.x + cropBox.width * 0.18, cropBox.y + cropBox.height * 0.18);
  await cropEditor.mouse.down();
  await cropEditor.mouse.move(cropBox.x + cropBox.width * 0.82, cropBox.y + cropBox.height * 0.82, { steps: 8 });
  await cropEditor.mouse.up();
  await delay(500);
  await cropEditor.getByRole('button', { name: /Apply crop/ }).click();
  await delay(900);
  const afterDimensions = await cropEditor.locator('.editor-title span').first().textContent();
  console.log('CROP_DIMENSIONS', JSON.stringify({ before: beforeDimensions, after: afterDimensions }));
  await cropEditor.screenshot({ path: path.join(out, 'e2e-crop.png') });
  await cropEditor.close();
  await delay(300);

  await homeAgain.click('button:has-text("Capture a region")');
  const overlay2 = await waitForWindow(app, 'overlay');
  watch(overlay2, 'inline-share-overlay');
  await overlay2.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(600);
  await overlay2.mouse.move(350, 380);
  await overlay2.mouse.down();
  await overlay2.mouse.move(950, 690, { steps: 10 });
  await overlay2.mouse.up();
  await delay(400);
  await overlay2.getByRole('button', { name: 'Arrow', exact: true }).click();
  await delay(200);
  await overlay2.mouse.move(460, 460);
  await overlay2.mouse.down();
  await overlay2.mouse.move(700, 520, { steps: 8 });
  await overlay2.mouse.up();
  await delay(300);
  await overlay2.getByRole('button', { name: 'Share', exact: true }).click();
  const inlineUpload = await waitForWindow(app, 'upload');
  watch(inlineUpload, 'inline-upload');
  await inlineUpload.waitForSelector('.upload-preview-card img', { timeout: 15000 });
  await delay(800);
  await inlineUpload.screenshot({ path: path.join(out, 'e2e-inline-share.png') });
  console.log('INLINE_SHARE_URL', await inlineUpload.locator('.link-row code').first().textContent());
  await inlineUpload.close();
  await delay(300);

  await homeAgain.click('button:has-text("Capture a region")');
  const overlay3 = await waitForWindow(app, 'overlay');
  watch(overlay3, 'edge-overlay');
  await overlay3.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(500);
  const edgeViewport = await overlay3.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const edgeStart = { x: edgeViewport.width - 620, y: edgeViewport.height - 380 };
  const edgeEnd = { x: edgeViewport.width - 10, y: edgeViewport.height - 10 };
  await overlay3.mouse.move(edgeStart.x, edgeStart.y);
  await overlay3.mouse.down();
  await overlay3.mouse.move(edgeEnd.x, edgeEnd.y, { steps: 8 });
  await overlay3.mouse.up();
  await delay(500);
  const edgeLayout = {
    rail: await overlay3.locator('.inline-rail').boundingBox(),
    bar: await overlay3.locator('.inline-actionbar').boundingBox(),
    viewport: edgeViewport,
    selectionEnd: edgeEnd
  };
  console.log('EDGE_LAYOUT', JSON.stringify(edgeLayout));
  if (!edgeLayout.rail || !edgeLayout.bar) throw new Error('Edge toolbars are missing');
  if (edgeLayout.rail.y + edgeLayout.rail.height > edgeLayout.viewport.height) throw new Error('Tool rail overflows the display');
  if (edgeLayout.bar.y + edgeLayout.bar.height > edgeLayout.viewport.height) throw new Error('Action bar overflows the display');
  if (edgeLayout.rail.x + edgeLayout.rail.width > edgeLayout.viewport.width) throw new Error('Tool rail overflows the display horizontally');
  if (edgeLayout.rail.x >= edgeStart.x) throw new Error('Tool rail did not flip to the left near the right edge');
  if (edgeLayout.bar.y >= edgeStart.y) throw new Error('Action bar did not flip above near the bottom edge');
  await overlay3.screenshot({ path: path.join(out, 'e2e-overlay-edge.png') });
  try {
    await overlay3.keyboard.press('Escape');
  } catch {
    // The overlay is expected to close as soon as Escape is handled.
  }
  await delay(300);

  await homeAgain.evaluate(async () => {
    const settings = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({ ...settings, capture: { ...settings.capture, lastRegion: null } });
  });
  await homeAgain.click('button:has-text("Capture a region")');
  const ellipseOverlay = await waitForWindow(app, 'overlay');
  watch(ellipseOverlay, 'ellipse-overlay');
  await ellipseOverlay.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(500);
  await ellipseOverlay.screenshot({ path: path.join(out, 'e2e-selection-modebar.png') });
  await ellipseOverlay.getByRole('button', { name: 'Ellipse selection', exact: true }).click();
  await ellipseOverlay.mouse.move(450, 380);
  await ellipseOverlay.mouse.down();
  await ellipseOverlay.mouse.move(980, 720, { steps: 10 });
  await ellipseOverlay.mouse.up();
  await delay(500);
  console.log('ELLIPSE_RAIL', await ellipseOverlay.locator('.inline-rail').isVisible());
  await ellipseOverlay.screenshot({ path: path.join(out, 'e2e-overlay-ellipse.png') });
  await ellipseOverlay.getByRole('button', { name: 'Edit', exact: true }).click();
  const ellipseEditor = await waitForWindow(app, 'editor');
  watch(ellipseEditor, 'ellipse-editor');
  await ellipseEditor.waitForSelector('canvas.editor-canvas', { timeout: 15000 });
  await delay(800);
  console.log('ELLIPSE_EDITOR', await ellipseEditor.locator('.editor-title span').first().textContent());
  await canvasAlphaCheck(ellipseEditor, 'ELLIPSE');
  await ellipseEditor.screenshot({ path: path.join(out, 'e2e-ellipse-editor.png') });
  await ellipseEditor.close();
  await delay(400);

  await homeAgain.evaluate(async () => {
    const settings = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({ ...settings, capture: { ...settings.capture, lastRegion: null } });
  });
  await homeAgain.click('button:has-text("Capture a region")');
  const lassoOverlay = await waitForWindow(app, 'overlay');
  watch(lassoOverlay, 'lasso-overlay');
  await lassoOverlay.waitForSelector('canvas.capture-canvas', { timeout: 15000 });
  await delay(500);
  await lassoOverlay.getByRole('button', { name: 'Freehand lasso selection', exact: true }).click();
  await lassoOverlay.mouse.move(520, 400);
  await lassoOverlay.mouse.down();
  const lassoPath = [
    [820, 420],
    [920, 620],
    [780, 760],
    [560, 680],
    [480, 500],
    [520, 400]
  ];
  for (const [x, y] of lassoPath) {
    await lassoOverlay.mouse.move(x, y, { steps: 4 });
    await delay(30);
  }
  await lassoOverlay.mouse.up();
  await delay(500);
  console.log('LASSO_RAIL', await lassoOverlay.locator('.inline-rail').isVisible());
  await lassoOverlay.screenshot({ path: path.join(out, 'e2e-overlay-lasso.png') });
  await lassoOverlay.getByRole('button', { name: 'Edit', exact: true }).click();
  const lassoEditor = await waitForWindow(app, 'editor');
  watch(lassoEditor, 'lasso-editor');
  await lassoEditor.waitForSelector('canvas.editor-canvas', { timeout: 15000 });
  await delay(800);
  await canvasAlphaCheck(lassoEditor, 'LASSO');
  await lassoEditor.screenshot({ path: path.join(out, 'e2e-lasso-editor.png') });
  await lassoEditor.close();
  await delay(400);

  // Update flow: a local manifest advertises 9.9.9. Reloading Home exercises the
  // same on-load check the app uses, then covers "Remind me later" and "Skip".
  updateFeedServer = createServer((request, response) => {
    if (request.url === '/latest.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          version: '9.9.9',
          downloadUrl: 'https://rajatmalik.dev/',
          releaseUrl: 'https://rajatmalik.dev/',
          notes: 'Automated update prompt test.',
          publishedAt: '2026-11-23T00:00:00Z'
        })
      );
      return;
    }
    response.writeHead(404);
    response.end('Not found');
  });
  await new Promise((resolve) => updateFeedServer.listen(0, '127.0.0.1', resolve));
  const updateAddress = updateFeedServer.address();
  if (!updateAddress || typeof updateAddress === 'string') throw new Error('Update test server did not bind');
  const updateFeedUrl = `http://127.0.0.1:${updateAddress.port}/latest.json`;

  await homeAgain.bringToFront();
  await homeAgain.evaluate(async ({ feedUrl }) => {
    const settings = await window.snapleaf.settings.get();
    await window.snapleaf.settings.update({
      ...settings,
      updates: {
        ...settings.updates,
        checkOnLaunch: true,
        feedUrl,
        skippedVersion: null,
        remindAfter: null
      }
    });
  }, { feedUrl: updateFeedUrl });
  await homeAgain.reload({ waitUntil: 'domcontentloaded' });
  await homeAgain.waitForSelector('text=Capture it. Mark it. Share it.', { timeout: 15000 });
  await homeAgain.waitForSelector('.update-dialog', { timeout: 15000 });
  await delay(350);
  console.log('UPDATE_DIALOG', JSON.stringify(await homeAgain.locator('#update-title').textContent()));
  await homeAgain.screenshot({ path: path.join(out, 'e2e-update-prompt.png') });
  await homeAgain.getByRole('button', { name: 'Remind me later', exact: true }).click();
  await delay(500);
  const reminded = await homeAgain.evaluate(async () => (await window.snapleaf.settings.get()).updates);
  console.log('UPDATE_REMIND', JSON.stringify(reminded));
  if (!reminded.remindAfter || reminded.remindAfter <= Date.now()) {
    throw new Error('Remind me later did not persist a future reminder');
  }

  await homeAgain.evaluate(() => window.snapleaf.updates.check(true));
  await homeAgain.waitForSelector('.update-dialog', { timeout: 10000 });
  await homeAgain.getByRole('button', { name: 'Skip this version', exact: true }).click();
  await delay(500);
  const skipped = await homeAgain.evaluate(async () => (await window.snapleaf.settings.get()).updates);
  console.log('UPDATE_SKIP', JSON.stringify(skipped));
  if (skipped.skippedVersion !== '9.9.9') {
    throw new Error(`Skip this version was not persisted: ${JSON.stringify(skipped)}`);
  }
} finally {
  if (updateFeedServer) await new Promise((resolve) => updateFeedServer.close(resolve));
  await app.close();
  fs.writeFileSync(path.join(out, 'e2e-errors.txt'), errors.join('\n\n') || 'No renderer errors');
  fs.writeFileSync(path.join(out, 'e2e-logs.txt'), logs.join('\n'));
  console.log('ERRORS', errors.length);
  for (const error of errors) console.log(error);
  console.log('LOGS', logs.length);
}
