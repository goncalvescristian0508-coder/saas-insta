// Gera os ícones PNG do PWA (sem dependências): fundo grafite, linha "pulse" azul elétrico.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function distSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); const cx = ax + t * dx, cy = ay + t * dy; return Math.hypot(px - cx, py - cy); }
// pulso (coordenadas normalizadas 0..1)
const PULSE = [[0.14, 0.56], [0.32, 0.56], [0.40, 0.36], [0.48, 0.70], [0.56, 0.30], [0.62, 0.56], [0.86, 0.56]];
function make(size, { rounded = true, maskable = false } = {}) {
  const radius = rounded ? size * 0.22 : 0;
  const lw = size * (maskable ? 0.05 : 0.065);
  return png(size, (x, y) => {
    // cantos arredondados
    if (radius) { const cx = Math.min(Math.max(x, radius), size - radius), cy = Math.min(Math.max(y, radius), size - radius); if (Math.hypot(x - cx, y - cy) > radius) return [0, 0, 0, 0]; }
    const t = y / size;
    let r = Math.round(11 + 6 * t), g = Math.round(18 + 10 * t), b = Math.round(32 + 18 * t);
    // brilho sutil no topo
    const glow = Math.max(0, 1 - Math.hypot(x / size - 0.5, y / size - 0.15) * 1.6);
    r += Math.round(glow * 10); g += Math.round(glow * 30); b += Math.round(glow * 60);
    const px = x / size, py = y / size;
    let d = Infinity;
    for (let i = 0; i < PULSE.length - 1; i++) d = Math.min(d, distSeg(px * size, py * size, PULSE[i][0] * size, PULSE[i][1] * size, PULSE[i + 1][0] * size, PULSE[i + 1][1] * size));
    const edge = lw / 2;
    if (d < edge + 1.2) { const a = Math.min(1, (edge + 1.2 - d) / 1.2); return [Math.round(r + (56 - r) * a), Math.round(g + (160 - g) * a), Math.round(b + (255 - b) * a), 255]; }
    return [r, g, b, 255];
  });
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', make(192));
writeFileSync('public/icons/icon-512.png', make(512));
writeFileSync('public/icons/icon-512-maskable.png', make(512, { rounded: false, maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', make(180, { rounded: false }));
writeFileSync('public/icons/badge-96.png', make(96, { rounded: true }));
console.log('ícones gerados em public/icons');
