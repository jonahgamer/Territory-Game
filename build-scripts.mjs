// Rebuild the browser bundle from the numbered source sections in scripts/.
// Usage: node build-scripts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const partsDir = path.join(root, 'scripts');
const bundle = path.join(root, 'script.js');

const files = fs.readdirSync(partsDir)
  .filter((name) => /^\d+-.*\.js$/.test(name))
  .sort();
if (files.length === 0) throw new Error('No source sections found in scripts/.');

const output = [
  '// Generated from scripts/*.js by build-scripts.mjs. Edit the source sections, not this file.',
  '',
  ...files.map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8').replace(/\s+$/, '')),
].join('\n');

fs.writeFileSync(bundle, `${output}\n`, 'utf8');
console.log(`Built script.js from ${files.length} source sections.`);
