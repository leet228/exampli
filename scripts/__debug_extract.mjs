import { readFileSync, writeFileSync } from 'fs';

const svg = readFileSync(new URL('../public/kursik2.svg', import.meta.url), 'utf8');
const match = svg.match(/<image[^>]+>/i);
if (match) {
  console.log('image tag:', match[0].slice(0, 200) + '...');
} else {
  console.log('no <image> tag found');
}
const payload = svg.match(/base64,([^\"]+)/);
if (!payload) {
  console.error('no base64 payload found');
  process.exit(1);
}
const data = payload[1];
writeFileSync(new URL('../__kursik2.png', import.meta.url), Buffer.from(data, 'base64'));
console.log('bytes', Buffer.byteLength(Buffer.from(data, 'base64')));
