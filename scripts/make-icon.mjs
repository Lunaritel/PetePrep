// Generates build/icon.png (512px) and build/icon.ico (16-256px): a periwinkle X on a cloud tile.
// Run with: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

const CLOUD = '#eef0f8';
const PERIWINKLE = '#5560d4';
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function draw(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const radius = size * 0.22;

  ctx.fillStyle = CLOUD;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();

  // Saint Andrew's cross: two diagonals with round caps, optically centred.
  const inset = size * 0.28;
  ctx.strokeStyle = PERIWINKLE;
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(size - inset, size - inset);
  ctx.moveTo(size - inset, inset);
  ctx.lineTo(inset, size - inset);
  ctx.stroke();
  return canvas.toBuffer('image/png');
}

/** ICO container holding PNG images (supported since Windows Vista). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach(({ size, data }, i) => {
    const at = i * 16;
    entries[at] = size >= 256 ? 0 : size;
    entries[at + 1] = size >= 256 ? 0 : size;
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.data)]);
}

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', draw(512));
writeFileSync('build/icon.ico', buildIco(SIZES.map((size) => ({ size, data: draw(size) }))));
console.log('wrote build/icon.png and build/icon.ico');
