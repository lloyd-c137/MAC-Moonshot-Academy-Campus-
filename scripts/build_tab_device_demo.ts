import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { FixedScheduleAdapter } from '../src/features/tab/schedule';
import { normalizeFixedFixture } from '../src/features/tab/data/fixedSchedule';
import { dailyScheduleFromFixed, displayViewModel } from '../src/features/tab/display/model';
import { MONO1_800X480_TEST } from '../src/features/tab/display/profiles';
import { renderDisplaySvg } from '../src/features/tab/display/render';
import { packRgbaMono1 } from '../src/features/tab/display/mono1';
import { buildDeviceManifest, frameRevision, type DeviceManifest } from '../src/features/tab/device/manifest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json');
const output = path.join(root, 'public/tab/demo/device/v1');
const rendererVersion = 'tab-epaper-svg-v1';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const adapter = new FixedScheduleAdapter(normalizeFixedFixture(fixture));
const scenarios = [
  { roomId: 'M123', date: '2026-11-10', mode: 'normal' as const },
  { roomId: 'M107', date: '2026-11-11', mode: 'normal' as const },
  { roomId: 'M115', date: '2026-11-12', mode: 'stress' as const },
];
await mkdir(path.join(output, 'frames'), { recursive: true });
await mkdir(path.join(output, 'previews'), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const manifests: Record<string, DeviceManifest> = {};
  for (const scenario of scenarios) {
    const schedule = dailyScheduleFromFixed(adapter, scenario.roomId, scenario.date, scenario.mode);
    const requiredM123Samples = scenario.roomId === 'M123' ? ['08:30', '10:50', '12:20', '16:00', '17:30'] : [];
    const times = ['00:00', ...new Set([...schedule.lessons.flatMap((lesson) => [lesson.start, lesson.end]), ...requiredM123Samples].filter((time) => time !== '24:00'))].sort();
    const frameAssets: Array<{ time: string; frameRevision: string; path: string; byteLength: number; sha256: string }> = [];
    for (const time of times) {
      const view = displayViewModel(schedule, time);
      const revision = await frameRevision(view, MONO1_800X480_TEST, rendererVersion, `${scenario.date}T${time}:00+08:00`);
      const svg = renderDisplaySvg(view, MONO1_800X480_TEST);
      const { rgba, png } = await page.evaluate(async ({ svgText, width, height }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas 2D context unavailable.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let binary = '';
        for (let i = 0; i < pixels.length; i += 0x8000) {
          const chunk: number[] = [];
          for (let offset = 0; offset < 0x8000 && i + offset < pixels.length; offset += 1) chunk.push(pixels[i + offset]);
          binary += String.fromCharCode.apply(null, chunk);
        }
        return { rgba: btoa(binary), png: canvas.toDataURL('image/png').split(',')[1] };
      }, { svgText: svg, width: MONO1_800X480_TEST.width, height: MONO1_800X480_TEST.height });
      const rgbaBytes = new Uint8Array(Buffer.from(rgba, 'base64'));
      const bitmap = packRgbaMono1(rgbaBytes, MONO1_800X480_TEST);
      const bytes = Buffer.from(bitmap.data);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const filename = `${revision.slice('sha256:'.length)}.bin`;
      const relativePath = `/tab/demo/device/v1/frames/${filename}`;
      await writeFile(path.join(output, 'frames', filename), bytes);
      if (scenario.roomId === 'M123' && time === '10:50') await writeFile(path.join(output, 'previews', 'M123-2026-11-10-1050.png'), Buffer.from(png, 'base64'));
      if (scenario.roomId === 'M107') await writeFile(path.join(output, 'previews', 'M107-2026-11-11.png'), Buffer.from(png, 'base64'));
      if (scenario.roomId === 'M115' && time === '10:00') await writeFile(path.join(output, 'previews', 'M115-2026-11-12-1000.png'), Buffer.from(png, 'base64'));
      frameAssets.push({ time, frameRevision: revision, path: relativePath, byteLength: bytes.length, sha256: hash });
    }
    const manifest = await buildDeviceManifest(schedule, MONO1_800X480_TEST, frameAssets);
    const filename = `manifest-${scenario.roomId}-${scenario.date}.json`;
    await writeFile(path.join(output, filename), `${JSON.stringify(manifest, null, 2)}\n`);
    manifests[scenario.roomId] = manifest;
  }
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifests.M123, null, 2)}\n`);
  await writeFile(path.join(output, 'index.json'), `${JSON.stringify({ schema_version: 1, mode: 'demo', manifests: Object.keys(manifests).map((roomId) => ({ room_id: roomId, path: `/tab/demo/device/v1/manifest-${roomId}-${manifests[roomId].date}.json` })) }, null, 2)}\n`);
  console.log(`Generated ${Object.values(manifests).reduce((sum, manifest) => sum + manifest.frames.length, 0)} frames for ${Object.keys(manifests).join(', ')} at 800x480 mono1.`);
} finally {
  await browser.close();
}
