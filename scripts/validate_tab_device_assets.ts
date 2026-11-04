import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceManifest } from '../src/features/tab/device/manifest';
import { validateDeviceManifest } from '../src/features/tab/device/manifest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'public/tab/demo/device/v1');
const index = JSON.parse(await readFile(path.join(base, 'index.json'), 'utf8')) as { manifests: Array<{ room_id: string; path: string }> };
const expected = new Set(['M123', 'M107', 'M115']);
assert.deepEqual(new Set(index.manifests.map((item) => item.room_id)), expected);
let totalFrames = 0;
for (const item of index.manifests) {
  const manifestPath = path.join(root, 'public', item.path.replace(/^\//, ''));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DeviceManifest;
  validateDeviceManifest(manifest);
  assert.equal(manifest.room_id, item.room_id);
  assert.equal(manifest.source.mode, 'demo');
  assert.equal(manifest.source.type, 'fixed');
  assert.equal(manifest.display_profile.width, 800);
  assert.equal(manifest.display_profile.height, 480);
  assert.equal(manifest.display_profile.format, 'mono1');
  totalFrames += manifest.frames.length;
  for (const frame of manifest.frames) {
    const framePath = path.join(root, 'public', frame.path.replace(/^\//, ''));
    const data = await readFile(framePath);
    assert.equal(data.length, 48000, `${frame.frame_revision} byte length`);
    assert.equal(createHash('sha256').update(data).digest('hex'), frame.sha256, `${frame.frame_revision} checksum`);
    assert.match(frame.frame_revision, /^sha256:[a-f0-9]{64}$/);
  }
}
assert.ok(totalFrames >= 35, `Expected frame boundaries to be materialized, got ${totalFrames}`);
console.log(`Verified ${totalFrames} 800x480 mono1 frames and their SHA-256 hashes.`);
