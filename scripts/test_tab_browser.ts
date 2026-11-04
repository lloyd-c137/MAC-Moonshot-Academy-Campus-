import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port = 4187;
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
const serverOutput: string[] = [];
server.stdout.on('data', (chunk) => serverOutput.push(String(chunk)));
server.stderr.on('data', (chunk) => serverOutput.push(String(chunk)));
const origin = `http://127.0.0.1:${port}`;
const errors: string[] = [];
const waitForServer = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { const response = await fetch(origin); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start: ${serverOutput.join('')}`);
};

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/tab/demo?room=M123&date=2026-11-10&time=10:50`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '电子纸课表预览' }).waitFor();
    const display = page.locator('section[aria-label="Tab 电子纸预览"]');
    await display.getByText('正在上课', { exact: false }).waitFor();
    await display.getByText('已取消').waitFor();
    await display.getByText('AP 英语文学与写作', { exact: false }).first().waitFor();
    await mkdir('docs/tab/evidence', { recursive: true });
    await display.screenshot({ path: 'docs/tab/evidence/browser-M123-2026-11-10-1050.png' });

    await page.getByLabel('搜索教室').fill('M107');
    await page.locator('section[aria-label="校园模拟课表总览"]').getByRole('button', { name: /M107/ }).click();
    await page.getByLabel('模拟日期').fill('2026-11-11');
    await display.getByText('今日无 AP 模拟排课').first().waitFor();
    await display.screenshot({ path: 'docs/tab/evidence/browser-M107-2026-11-11.png' });

    await page.getByLabel('搜索教室').fill('M115');
    await page.locator('section[aria-label="校园模拟课表总览"]').getByRole('button', { name: /M115/ }).click();
    await page.getByRole('button', { name: /打开 M115/ }).click();
    await page.locator('input[aria-label="模拟时间"]').fill('10:00');
    assert.equal(await display.locator('ol li').count(), 11, 'M115 stress view displays all 11 lessons');
    await display.screenshot({ path: 'docs/tab/evidence/browser-M115-2026-11-12-stress.png' });
    assert.deepEqual(errors, [], `browser errors: ${errors.join(', ')}`);
    console.log('Tab browser interaction checks passed: M123 current/cancelled, M107 valid empty, M115 all 11 lessons.');
  } finally { await browser.close(); }
} finally {
  server.kill('SIGTERM');
}
