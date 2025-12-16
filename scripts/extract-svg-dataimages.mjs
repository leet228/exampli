import { promises as fs } from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const publicDir = path.join(projectRoot, 'public');

function mimeToExt(mime) {
  const m = String(mime).toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/avif') return 'avif';
  // fallback (keep something sane)
  return m.replace(/^image\//, '').replace(/[^a-z0-9]+/g, '') || 'bin';
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function replaceAllDataImages(svgText, relSvgPath, onExtract) {
  // Matches href="data:image/...;base64,...." OR xlink:href="data:image/...;base64,...."
  // base64 payload is everything up to the next quote.
  const re = /(xlink:href|href)=(['"])data:(image\/[a-z0-9.+-]+);base64,([^'\"]+)\2/gi;

  let idx = 0;
  let changed = false;
  const next = svgText.replace(re, (_m, _attr, quote, mime, b64) => {
    const ext = mimeToExt(mime);
    const outName = `${path.basename(relSvgPath, '.svg')}.img${idx}.${ext}`;
    idx += 1;
    changed = true;
    onExtract({ outName, mime, b64 });
    // Use modern href, but write ABSOLUTE path so it still works
    // when SVG is inlined into a data: URL (relative URLs break there).
    const relDir = path.posix.dirname(relSvgPath.replace(/\\/g, '/'));
    const abs = (relDir && relDir !== '.' ? `/${relDir}/${outName}` : `/${outName}`);
    return `href=${quote}${abs}${quote}`;
  });

  return { next, changed, extractedCount: idx };
}

function absolutizeExtractedImageHrefs(svgText, relSvgPath) {
  const relDir = path.posix.dirname(relSvgPath.replace(/\\/g, '/'));
  const prefix = (relDir && relDir !== '.') ? `/${relDir}/` : '/';

  // Only rewrite <image href="*.imgN.ext"> (our extracted assets).
  const re = /(<image\b[^>]*\bhref=)(['"])([^'">]+)\2/gi;
  let changed = false;
  const next = svgText.replace(re, (m, before, q, href) => {
    const h = String(href || '');
    if (!h) return m;
    if (h.startsWith('/') || h.startsWith('#') || /^https?:/i.test(h) || /^data:/i.test(h)) return m;
    if (!/\.img\d+\.(png|jpe?g|webp|gif|avif)$/i.test(h)) return m;
    changed = true;
    return `${before}${q}${prefix}${h}${q}`;
  });

  return { next, changed };
}

async function main() {
  const all = await walk(publicDir);
  const svgs = all.filter((p) => p.toLowerCase().endsWith('.svg'));

  let totalExtracted = 0;
  let filesChanged = 0;

  for (const svgPath of svgs) {
    let svgText;
    try {
      svgText = await fs.readFile(svgPath, 'utf8');
    } catch {
      continue;
    }

    const relSvgPath = path.relative(publicDir, svgPath).replace(/\\/g, '/');
    const dir = path.dirname(svgPath);

    const extracts = [];
    const r1 = replaceAllDataImages(svgText, relSvgPath, (x) => extracts.push(x));
    const r2 = absolutizeExtractedImageHrefs(r1.next, relSvgPath);
    const changed = r1.changed || r2.changed;
    const extractedCount = r1.extractedCount;
    const next = r2.next;
    if (!changed) continue;

    // Write extracted binaries
    for (const ex of extracts) {
      const outPath = path.join(dir, ex.outName);
      const buf = Buffer.from(ex.b64, 'base64');
      await fs.writeFile(outPath, buf);
    }

    // Write updated SVG (same filename)
    await fs.writeFile(svgPath, next, 'utf8');

    totalExtracted += extractedCount;
    filesChanged += 1;
    console.log(`[extract-svg-dataimages] ${relSvgPath}: extracted ${extractedCount} image(s)`);
  }

  console.log(`[extract-svg-dataimages] Done. Changed ${filesChanged} SVG(s), extracted ${totalExtracted} embedded image(s).`);
}

main().catch((err) => {
  console.error('[extract-svg-dataimages] Failed:', err);
  process.exitCode = 1;
});
