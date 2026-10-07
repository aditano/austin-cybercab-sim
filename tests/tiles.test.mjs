import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tilesSrc = readFileSync(join(root, 'src/tiles.ts'), 'utf8');
const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');

test('tiles module keeps the Google root URL and ENU remap', () => {
  assert.match(tilesSrc, /tile\.googleapis\.com\/v1\/3dtiles\/root\.json/);
  assert.match(tilesSrc, /GoogleCloudAuthPlugin/);
  assert.match(tilesSrc, /ReorientationPlugin/);
  assert.match(tilesSrc, /getEastNorthUpFrame/);
  assert.match(tilesSrc, /VITE_GOOGLE_MAPS_API_KEY/);
  assert.match(tilesSrc, /Imagery © Google/);
});

test('API key stays out of git via env example and ignore rules', () => {
  assert.match(envExample, /VITE_GOOGLE_MAPS_API_KEY=/);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.local$/m);
  assert.doesNotMatch(envExample, /AIzaSy/);
});
