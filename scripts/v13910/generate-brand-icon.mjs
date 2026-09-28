import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 512;
const OUTPUT = path.resolve('client/public/icons/crewcheck-icon-v2.png');

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mix = (a, b, amount) => a + (b - a) * amount;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby || 1;
  const amount = clamp(((px - ax) * abx + (py - ay) * aby) / denominator);
  const dx = px - (ax + amount * abx);
  const dy = py - (ay + amount * aby);
  return Math.hypot(dx, dy);
}

function roundedSquareCoverage(x, y) {
  const radius = 92;
  const inset = 0.5;
  const half = SIZE / 2 - inset;
  const qx = Math.abs(x - SIZE / 2) - (half - radius);
  const qy = Math.abs(y - SIZE / 2) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  const signedDistance = outside + inside - radius;
  return clamp(0.75 - signedDistance);
}

function gradientColor(x, y) {
  const nx = x / (SIZE - 1);
  const ny = y / (SIZE - 1);
  const violet = [154, 77, 255];
  const magenta = [236, 44, 134];
  const cyan = [39, 195, 232];
  const top = violet.map((value, index) => mix(value, magenta[index], nx));
  const bottom = magenta.map((value, index) => mix(value, cyan[index], nx));
  const base = top.map((value, index) => mix(value, bottom[index], ny));

  // Discreto brilho central para manter o acabamento Premium sem comprometer legibilidade.
  const highlight = clamp(1 - Math.hypot(nx - 0.48, ny - 0.43) / 0.8) * 0.09;
  return base.map((value) => Math.round(mix(value, 255, highlight)));
}

const airplane = [
  [0.20, 0.42], [0.43, 0.46], [0.66, 0.27], [0.75, 0.22], [0.79, 0.26],
  [0.58, 0.50], [0.61, 0.78], [0.55, 0.81], [0.43, 0.61], [0.34, 0.70],
  [0.28, 0.79], [0.23, 0.76], [0.27, 0.65], [0.17, 0.60], [0.15, 0.56],
  [0.18, 0.52], [0.29, 0.54], [0.17, 0.49], [0.15, 0.45], [0.20, 0.42],
].map(([x, y]) => [x * SIZE, y * SIZE]);

function airplaneCoverage(x, y) {
  let minimum = Infinity;
  for (let index = 0; index < airplane.length - 1; index++) {
    const [ax, ay] = airplane[index];
    const [bx, by] = airplane[index + 1];
    minimum = Math.min(minimum, distanceToSegment(x, y, ax, ay, bx, by));
  }
  const halfStroke = 16.5;
  return clamp(halfStroke + 1 - minimum);
}

function render() {
  const stride = SIZE * 4 + 1;
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = y * stride;
    raw[row] = 0; // filtro PNG: none
    for (let x = 0; x < SIZE; x++) {
      const offset = row + 1 + x * 4;
      const tileAlpha = roundedSquareCoverage(x + 0.5, y + 0.5);
      const [red, green, blue] = gradientColor(x, y);
      const planeAlpha = airplaneCoverage(x + 0.5, y + 0.5);
      raw[offset] = Math.round(mix(red, 255, planeAlpha));
      raw[offset + 1] = Math.round(mix(green, 255, planeAlpha));
      raw[offset + 2] = Math.round(mix(blue, 255, planeAlpha));
      raw[offset + 3] = Math.round(tileAlpha * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, png);
  console.log(`CrewCheck: ícone oficial gerado em ${SIZE}x${SIZE} (${Math.round(png.length / 1024)} KB).`);
}

render();
