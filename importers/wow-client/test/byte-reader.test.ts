import { describe, expect, it } from "vitest";
import { ByteReader } from "../src/casc/byte-reader.js";

describe("ByteReader", () => {
  it("reads little-endian integers at the right widths", () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const r = new ByteReader(buf);
    expect(r.readUInt8()).toBe(0x01);
    expect(r.readUInt16LE()).toBe(0x0302); // bytes [0x02, 0x03] as LE
    expect(r.remainingBytes).toBe(1);
  });

  it("reads UInt32LE and Int32BE correctly", () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0x11223344, 0);
    buf.writeInt32BE(-1, 4);
    const r = new ByteReader(buf);
    expect(r.readUInt32LE()).toBe(0x11223344);
    expect(r.readInt32BE()).toBe(-1);
  });

  it("reads a 40-bit big-endian value (encoding-table file sizes)", () => {
    const buf = Buffer.alloc(5);
    buf.writeUIntBE(0x0102030405, 0, 5);
    const r = new ByteReader(buf);
    expect(r.readUInt40BE()).toBe(0x0102030405);
  });

  it("reads hex strings of a given byte length", () => {
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const r = new ByteReader(buf);
    expect(r.readHexString(4)).toBe("deadbeef");
  });

  it("reverses FourCC tags (WDT/ADT chunk convention)", () => {
    // "MVER" stored reversed on disk, as confirmed against a real WDT file.
    const buf = Buffer.from("REVM", "ascii");
    const r = new ByteReader(buf);
    expect(r.readFourCC()).toBe("MVER");
  });

  it("seek/move respect buffer bounds", () => {
    const r = new ByteReader(Buffer.alloc(4));
    expect(() => r.seek(5)).toThrow();
    expect(() => r.move(-1)).toThrow();
    r.seek(4);
    expect(r.remainingBytes).toBe(0);
  });
});
