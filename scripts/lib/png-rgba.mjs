import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crcTable();
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.from(data);
  const output = Buffer.alloc(12 + body.length);
  output.writeUInt32BE(body.length, 0);
  name.copy(output, 4);
  body.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, body])), 8 + body.length);
  return output;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngRgba(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Arquivo não é PNG.');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  if (!width || !height || !idat.length) throw new Error('PNG incompleto.');
  if (bitDepth !== 8) throw new Error(`PNG com bit depth ${bitDepth} não suportado; esperado 8.`);
  if (interlace !== 0) throw new Error('PNG entrelaçado não suportado.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Tipo de cor PNG ${colorType} não suportado.`);
  if (colorType === 3 && !palette) throw new Error('PNG indexado sem paleta.');
  const rowBytes = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  if (inflated.length !== height * (rowBytes + 1)) throw new Error('Comprimento de dados PNG inesperado.');
  const raw = Buffer.alloc(height * rowBytes);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= channels ? raw[rowOffset + x - channels] : 0;
      const up = y > 0 ? raw[rowOffset - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= channels ? raw[rowOffset - rowBytes + x - channels] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else throw new Error(`Filtro PNG desconhecido: ${filter}.`);
      raw[rowOffset + x] = decoded & 0xff;
    }
    sourceOffset += rowBytes;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0, o = 0; i < width * height; i += 1, p += channels, o += 4) {
    if (colorType === 6) {
      rgba[o] = raw[p]; rgba[o + 1] = raw[p + 1]; rgba[o + 2] = raw[p + 2]; rgba[o + 3] = raw[p + 3];
    } else if (colorType === 2) {
      rgba[o] = raw[p]; rgba[o + 1] = raw[p + 1]; rgba[o + 2] = raw[p + 2]; rgba[o + 3] = 255;
    } else if (colorType === 3) {
      const index = raw[p];
      const paletteOffset = index * 3;
      rgba[o] = palette[paletteOffset] ?? 0;
      rgba[o + 1] = palette[paletteOffset + 1] ?? 0;
      rgba[o + 2] = palette[paletteOffset + 2] ?? 0;
      rgba[o + 3] = transparency?.[index] ?? 255;
    } else if (colorType === 4) {
      rgba[o] = raw[p]; rgba[o + 1] = raw[p]; rgba[o + 2] = raw[p]; rgba[o + 3] = raw[p + 1];
    } else {
      rgba[o] = raw[p]; rgba[o + 1] = raw[p]; rgba[o + 2] = raw[p]; rgba[o + 3] = 255;
    }
  }
  return { width, height, data: rgba };
}

export function resizeRgbaBilinear(image, targetWidth, targetHeight) {
  const { width, height, data } = image;
  if (!width || !height || !targetWidth || !targetHeight) throw new Error('Dimensões inválidas.');
  const output = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(0, Math.min(height - 1, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(0, Math.min(width - 1, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sourceX - x0;
      const out = (y * targetWidth + x) * 4;
      const p00 = (y0 * width + x0) * 4;
      const p10 = (y0 * width + x1) * 4;
      const p01 = (y1 * width + x0) * 4;
      const p11 = (y1 * width + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = data[p00 + channel] * (1 - fx) + data[p10 + channel] * fx;
        const bottom = data[p01 + channel] * (1 - fx) + data[p11 + channel] * fx;
        output[out + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width: targetWidth, height: targetHeight, data: output };
}

export function encodePngRgba(image) {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new Error('Buffer RGBA incompatível com as dimensões.');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    data.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND')]);
}

export function writeResizedPng(sourcePath, targetPath, width, height) {
  const decoded = decodePngRgba(sourcePath);
  const resized = resizeRgbaBilinear(decoded, width, height);
  fs.mkdirSync(new URL('.', `file://${targetPath}`).pathname, { recursive: true });
  fs.writeFileSync(targetPath, encodePngRgba(resized));
  return { sourceWidth: decoded.width, sourceHeight: decoded.height, width, height, targetPath };
}
