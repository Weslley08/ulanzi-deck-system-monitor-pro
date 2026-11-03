// Minimal zip writer and reader, so packaging needs no extra dependency.
// Entries use a fixed date: the same files always produce the same bytes, which makes releases auditable.
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const FIXED_DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {{name: string, data: Buffer}[]} entries */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const nameBytes = Buffer.from(name);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(FIXED_DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

/** @returns {Map<string, Buffer>} */
export function readZip(zip) {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a zip file');
  const count = zip.readUInt16LE(endAt + 10);
  const files = new Map();
  let at = zip.readUInt32LE(endAt + 16);
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error('corrupt central directory');
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const raw = zip.subarray(dataAt, dataAt + compressedSize);
    const data = method === DEFLATE ? inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) throw new Error(`bad checksum: ${name}`);
    files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
