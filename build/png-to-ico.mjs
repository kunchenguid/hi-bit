#!/usr/bin/env node
// Build a Windows .ico file with PNG-embedded directory entries from a list of PNG inputs.
// Usage: node build/png-to-ico.mjs <out.ico> <input1.png> [input2.png ...]
// Windows Vista+ supports PNG-embedded ICO directory entries, so this avoids bitmap conversion.

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit, stderr } from "node:process";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngDimensions(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG");
  }
  // IHDR chunk starts at byte 8 (4 len + 4 type + 13 data + 4 crc). Width/height are the first 8 bytes of data.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function main() {
  const [, , outPath, ...inputs] = argv;
  if (!outPath || inputs.length === 0) {
    stderr.write("usage: png-to-ico.mjs <out.ico> <input1.png> [input2.png ...]\n");
    exit(2);
  }

  const entries = inputs.map((p) => {
    const data = readFileSync(p);
    const { width, height } = readPngDimensions(data);
    if (width !== height) {
      throw new Error(`${p}: expected square PNG, got ${width}x${height}`);
    }
    if (width > 256) {
      throw new Error(`${p}: ICO images must be <= 256px, got ${width}`);
    }
    return { width, height, data };
  });

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * entries.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  const payloads = [];
  let offset = dirSize;
  for (const e of entries) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(e.width === 256 ? 0 : e.width, 0);
    entry.writeUInt8(e.height === 256 ? 0 : e.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(e.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    payloads.push(e.data);
    offset += e.data.length;
  }

  const ico = Buffer.concat([header, ...dirEntries, ...payloads]);
  writeFileSync(outPath, ico);
}

main();
