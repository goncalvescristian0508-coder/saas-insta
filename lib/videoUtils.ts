/** Strip embedded MP4 metadata (mvhd/tkhd timestamps + udta box) without ffmpeg */
export function stripMp4Metadata(input: Buffer): Buffer {
  const buf = Buffer.from(input);
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset);
    if (size < 8 || offset + size > buf.length) break;
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "moov") {
      stripBoxes(buf, offset + 8, offset + size);
    }
    offset += size;
  }
  return buf;
}

function stripBoxes(buf: Buffer, start: number, end: number): void {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buf.readUInt32BE(offset);
    if (size < 8 || offset + size > end) break;
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "mvhd" || type === "tkhd") {
      const v = buf[offset + 8];
      const timeStart = offset + 8 + 4;
      const timeLen = v === 1 ? 16 : 8;
      buf.fill(0, timeStart, timeStart + timeLen);
    } else if (type === "udta" || type === "meta" || type === "ilst") {
      buf.write("free", offset + 4, "ascii");
      buf.fill(0, offset + 8, offset + size);
    } else if (type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
      stripBoxes(buf, offset + 8, offset + size);
    }
    offset += size;
  }
}
