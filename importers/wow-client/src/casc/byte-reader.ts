/**
 * A minimal sequential binary reader — our own original implementation of
 * the small subset of wow.export's `BufferWrapper` API this package
 * actually needs (readUInt8/16/32, signed variants, a 40-bit BE reader for
 * encoding-file sizes, hex-string reads, seek/move). Written fresh rather
 * than copying wow.export's much larger BufferWrapper class (which also
 * handles WebP/canvas/crc32/zlib helpers unrelated to CASC parsing) — see
 * importers/wow-client/README.md for the attribution/porting notes that
 * apply to this whole package.
 */
export class ByteReader {
  private buf: Buffer;
  private pos = 0;

  constructor(buf: Buffer) {
    this.buf = buf;
  }

  get offset(): number {
    return this.pos;
  }

  get byteLength(): number {
    return this.buf.byteLength;
  }

  get remainingBytes(): number {
    return this.buf.byteLength - this.pos;
  }

  get raw(): Buffer {
    return this.buf;
  }

  seek(ofs: number): void {
    const pos = ofs < 0 ? this.byteLength + ofs : ofs;
    if (pos < 0 || pos > this.byteLength) throw new Error(`seek() out of bounds: ${ofs} -> ${pos} / ${this.byteLength}`);
    this.pos = pos;
  }

  move(ofs: number): void {
    // Deliberately not implemented via seek(this.pos + ofs): seek() treats a
    // negative absolute position as "N bytes from the end," which would
    // silently wrap an out-of-bounds backward move into a valid position
    // instead of throwing. move()'s target must be bounds-checked as-is.
    const pos = this.pos + ofs;
    if (pos < 0 || pos > this.byteLength) throw new Error(`move() out of bounds: ${ofs} -> ${pos} / ${this.byteLength}`);
    this.pos = pos;
  }

  readUInt8(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readUInt16LE(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readInt16BE(): number {
    const v = this.buf.readInt16BE(this.pos);
    this.pos += 2;
    return v;
  }

  readUInt32LE(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readInt32LE(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readUInt32BE(): number {
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  readInt32BE(): number {
    const v = this.buf.readInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  /** 40-bit (5-byte) big-endian unsigned integer, as used for file sizes in the CASC encoding table. */
  readUInt40BE(): number {
    const v = this.buf.readUIntBE(this.pos, 5);
    this.pos += 5;
    return v;
  }

  readHexString(length: number): string {
    const v = this.buf.toString("hex", this.pos, this.pos + length);
    this.pos += length;
    return v;
  }

  readBytes(length: number): Buffer {
    const v = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return v;
  }

  readFourCC(): string {
    // WoW chunk FourCCs are stored reversed in the file (e.g. "REVM" on disk = "MVER").
    const bytes = this.readBytes(4);
    return Buffer.from([bytes[3], bytes[2], bytes[1], bytes[0]]).toString("ascii");
  }
}
