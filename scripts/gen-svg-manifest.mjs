import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'svg-manifest.json');

const SKIP_DIRS = new Set(['en_ege']); // audio-heavy folder не нужен для SVG

async function collectSvgs(root) {
  const out = [];

  async function walk(dir, relBase = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relBase, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
        out.push('/' + relPath.replace(/\\/g, '/'));
      }
    }
  }

  await walk(root);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function ensureManifest() {
  const svgs = await collectSvgs(publicDir);
  const payload = {
    generatedAt: new Date().toISOString(),
    count: svgs.length,
    svgs,
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2));
  console.log(`[svg-manifest] Collected ${svgs.length} SVGs → ${path.relative(projectRoot, manifestPath)}`);
}

ensureManifest().catch((err) => {
  console.error('[svg-manifest] Failed to build manifest:', err);
  process.exitCode = 1;
});

