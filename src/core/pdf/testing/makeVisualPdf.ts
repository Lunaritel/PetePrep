import { deflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';

function crc32(buf: Buffer): number {
  let r = 0xffffffff;
  for (const byte of buf) {
    r ^= byte;
    for (let k = 0; k < 8; k += 1) r = r & 1 ? 0xedb88320 ^ (r >>> 1) : r >>> 1;
  }
  return (r ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A tiny solid-colour PNG, enough for pdfkit to embed a real image XObject. */
function solidPng(size: number): Buffer {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) raw[y * stride + 1 + x * 3] = 255;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function options(doc: PDFKit.PDFDocument, top: number): void {
  ['alpha', 'beta', 'gamma', 'delta'].forEach((t, i) => {
    // Marker and text are separate runs, as in the real DECA PDFs.
    doc.text(`${'ABCD'[i]}.`, 61, top + i * 14).text(t, 75, top + i * 14);
  });
}

/**
 * One US-Letter page, three questions: 1 has an embedded image, 2 has a ruled table,
 * 3 is plain text. Positions are fixed so tests can assert which question owns which region.
 */
export function makeVisualPdf(): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const parts: Buffer[] = [];
    doc.on('data', (c: Buffer) => parts.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(parts))));
    doc.fontSize(10);
    doc.text('Test 1 SAMPLE EXAM', 40, 40);
    doc.text('1.', 40, 80).text('Which item is shown in the picture below?', 61, 80);
    doc.image(solidPng(8), 70, 100, { width: 120, height: 80 });
    options(doc, 200);
    doc.text('2.', 40, 280).text('Use the table to answer the question.', 61, 280);
    for (let r = 0; r <= 3; r += 1) doc.moveTo(70, 300 + r * 20).lineTo(270, 300 + r * 20).stroke();
    for (let c = 0; c <= 3; c += 1) doc.moveTo(70 + c * 66, 300).lineTo(70 + c * 66, 360).stroke();
    doc.text('Cell', 75, 305);
    options(doc, 375);
    doc.text('3.', 40, 460).text('Which option is correct for this plain question?', 61, 460);
    options(doc, 480);
    doc.end();
  });
}
