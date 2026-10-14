const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const outDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Screenshot 1 — Full Campus 2.5D
  console.log('Capturing Screenshot 1: Full Campus 2.5D ...');
  await page.screenshot({ path: path.join(outDir, 'screenshot_1_full_campus_2.5d.png') });

  // 2. Select M104 room
  console.log('Selecting M104 一小步空间 ...');
  await page.click('text=M104 一小步空间');
  await page.waitForTimeout(1000);

  // Screenshot 5 — Selected Room
  console.log('Capturing Screenshot 5: Selected Room ...');
  await page.screenshot({ path: path.join(outDir, 'screenshot_5_selected_room.png') });

  // 3. Zoom into M103 / M104 Cutaway
  console.log('Capturing Screenshot 3: M103 / M104 Cutaway ...');
  await page.click('button[title*="放大"]');
  await page.waitForTimeout(300);
  await page.click('button[title*="放大"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'screenshot_3_m103_m104_cutaway.png') });

  // 4. Focus on Lotus Arena Detail
  console.log('Capturing Screenshot 2: Lotus Arena Detail ...');
  // Click reset view
  await page.click('button[title*="重置视角"]');
  await page.waitForTimeout(800);
  await page.click('button[title*="放大"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'screenshot_2_lotus_arena_detail.png') });

  // 5. Screenshot 4 — Full Campus 2D Plan View
  console.log('Switching to 2D Plan View ...');
  await page.click('button:has-text("2D 平面")');
  await page.waitForTimeout(900);
  await page.click('button[title*="全图视野"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, 'screenshot_4_full_campus_2d_plan.png') });

  // 6. Screenshot 6 — Environment Layer
  console.log('Activating Temperature Environment Layer ...');
  await page.click('header button:has-text("环境")');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, 'screenshot_6_environment_layer.png') });

  // 7. Screenshot 7 — Camera Interaction (Pan & Rotate in 2.5D)
  console.log('Testing 2.5D Orbit Rotation & Pan ...');
  await page.click('button:has-text("2.5D 立体")');
  await page.waitForTimeout(800);

  // Perform right-drag rotation
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + 140, cy - 50, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(outDir, 'screenshot_7_camera_interaction.png') });

  console.log('SUCCESS: All 7 Visual Acceptance Screenshots generated cleanly!');
  await browser.close();
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
