import { readFile, readdir } from "node:fs/promises";
import { readSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { ByteReader } from "./byte-reader.js";
import { parseBuildInfo, parseKeyValueConfig } from "./config-parser.js";
import { decodeBlte } from "./blte.js";

/**
 * Reads World of Warcraft's local CASC storage directly — no GUI, no
 * wow.export process involved. This is a from-scratch TypeScript
 * implementation, written by porting the *logic* (binary formats, file
 * layout) documented in wow.export's MIT-licensed source
 * (casc-source.js/casc-source-local.js) rather than copying its code,
 * since that code is deeply coupled to wow.export's own Electron/Vue app
 * internals (a `core` event bus, a custom BufferWrapper class, a native
 * mmap addon for a listfile feature this project doesn't need). See
 * importers/wow-client/README.md for the full attribution and porting notes.
 *
 * Deliberately narrow scope: this reads files by FileDataID only (no
 * listfile/path-based lookup — Blizzard's own DB2 data already gives us
 * the FileDataIDs we need, e.g. `Map.WdtFileDataID`), enUS locale only,
 * and does not support Salsa20-encrypted content (never expected for
 * minimap textures).
 */

const LOCALE_ENUS = 0x2;
const CONTENT_FLAG_LOW_VIOLENCE = 0x80;

interface RootEntry {
  // rootTypeIndex -> contentKey (hex)
  byType: Map<number, string>;
}

interface RootType {
  contentFlags: number;
  localeFlags: number;
}

interface IndexEntry {
  archiveIndex: number;
  offset: number;
  size: number;
}

export class LocalCasc {
  private readonly installDir: string;
  private readonly dataDir: string;
  private readonly storageDir: string;

  private buildConfig: Record<string, string> = {};
  private localIndexes = new Map<string, IndexEntry>();
  private encodingKeys = new Map<string, string>(); // contentKey -> encodingKey
  private rootEntries = new Map<number, RootEntry>();
  private rootTypes: RootType[] = [];

  constructor(installDir: string) {
    this.installDir = installDir;
    this.dataDir = join(installDir, "Data");
    this.storageDir = join(this.dataDir, "data");
  }

  /** Opens local storage for the given product (e.g. "wow_classic_beta") and loads its encoding/root tables. */
  static async open(installDir: string, product: string): Promise<LocalCasc> {
    const casc = new LocalCasc(installDir);
    await casc.init(product);
    return casc;
  }

  private async init(product: string): Promise<void> {
    const buildInfoText = await readFile(join(this.installDir, ".build.info"), "utf-8");
    const builds = parseBuildInfo(buildInfoText);
    const build = builds.find((b) => b.Product === product);
    if (!build) {
      throw new Error(
        `Product "${product}" not found in .build.info. Available: ${builds.map((b) => b.Product).join(", ")}`
      );
    }

    const buildKey = build["BuildKey"];
    if (!buildKey) throw new Error(".build.info row is missing a Build Key column");

    this.buildConfig = parseKeyValueConfig(await readFile(this.formatConfigPath(buildKey), "utf-8"));

    await this.loadIndexes();
    await this.loadEncoding();
    await this.loadRoot();
  }

  /**
   * CASC .idx files are named `<bucket:2hex><version:8hex>.idx`. Patches
   * leave old generations on disk (confirmed empirically: e.g. bucket "00"
   * had five files on this install, versions 03 through 7f) — parsing all
   * of them and keeping whichever key we see *first* means a later patch
   * that relocated a file (a very common case for ground textures, which
   * this project didn't need until adding real-terrain rendering) silently
   * loses to its own stale, superseded entry. Only the highest version per
   * bucket is authoritative.
   */
  private async loadIndexes(): Promise<void> {
    const entries = await readdir(this.storageDir, { withFileTypes: true });
    const latestByBucket = new Map<string, { name: string; version: number }>();
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".idx")) continue;
      const stem = entry.name.slice(0, -4);
      if (stem.length !== 10) continue;
      const bucket = stem.slice(0, 2);
      const version = Number.parseInt(stem.slice(2), 16);
      const current = latestByBucket.get(bucket);
      if (!current || version > current.version) latestByBucket.set(bucket, { name: entry.name, version });
    }
    for (const { name } of latestByBucket.values()) {
      await this.parseIndexFile(join(this.storageDir, name));
    }
  }

  private async parseIndexFile(file: string): Promise<void> {
    const reader = new ByteReader(await readFile(file));

    const headerHashSize = reader.readInt32LE();
    reader.move(4); // headerHash checksum (uint32)
    reader.move(headerHashSize);

    // Advance to the next 16-byte boundary, per the real CASC .idx layout.
    reader.seek((8 + headerHashSize + 0x0f) & 0xfffffff0);

    const dataLength = reader.readInt32LE();
    reader.move(4); // block checksum

    const numEntries = Math.floor(dataLength / 18);
    for (let i = 0; i < numEntries; i++) {
      const key = reader.readHexString(9);
      if (this.localIndexes.has(key)) {
        reader.move(1 + 4 + 4);
        continue;
      }
      const idxHigh = reader.readUInt8();
      const idxLow = reader.readInt32BE();
      const size = reader.readInt32LE();
      this.localIndexes.set(key, {
        archiveIndex: (idxHigh << 2) | ((idxLow & 0xc0000000) >>> 30),
        offset: idxLow & 0x3fffffff,
        size,
      });
    }
  }

  private async loadEncoding(): Promise<void> {
    const encoding = this.buildConfig["encoding"];
    if (!encoding) throw new Error("BuildConfig has no 'encoding' field");
    const [, encodingKeyOfEncodingFile] = encoding.split(" ");
    const raw = decodeBlte(this.readArchiveByKey(encodingKeyOfEncodingFile));
    this.parseEncodingFile(raw);
  }

  private parseEncodingFile(data: Buffer): void {
    const reader = new ByteReader(data);
    const magic = reader.readUInt16LE();
    if (magic !== 0x4e45) throw new Error(`Encoding file: bad magic 0x${magic.toString(16)}`); // "EN"

    reader.move(1); // version
    const hashSizeCKey = reader.readUInt8();
    const hashSizeEKey = reader.readUInt8();
    const cKeyPageSize = reader.readInt16BE() * 1024;
    reader.move(2); // eKeyPageSize
    const cKeyPageCount = reader.readInt32BE();
    reader.move(4 + 1); // eKeyPageCount + unk
    const specBlockSize = reader.readInt32BE();

    reader.move(specBlockSize + cKeyPageCount * (hashSizeCKey + 16));

    const pagesStart = reader.offset;
    for (let i = 0; i < cKeyPageCount; i++) {
      const pageStart = pagesStart + cKeyPageSize * i;
      reader.seek(pageStart);
      const pageEnd = pageStart + cKeyPageSize;

      while (reader.offset < pageEnd) {
        const keysCount = reader.readUInt8();
        if (keysCount === 0) break;

        reader.readUInt40BE(); // decompressed file size
        const cKey = reader.readHexString(hashSizeCKey);
        const eKey = reader.readHexString(hashSizeEKey);
        this.encodingKeys.set(cKey, eKey);
        reader.move(hashSizeEKey * (keysCount - 1));
      }
    }
  }

  private async loadRoot(): Promise<void> {
    const rootContentKey = this.buildConfig["root"];
    if (!rootContentKey) throw new Error("BuildConfig has no 'root' field");
    const rootEncodingKey = this.encodingKeys.get(rootContentKey);
    if (!rootEncodingKey) throw new Error("No encoding entry for root content key");

    const raw = decodeBlte(this.readArchiveByKey(rootEncodingKey));
    this.parseRootFile(raw);
  }

  private parseRootFile(data: Buffer): void {
    const reader = new ByteReader(data);
    const magic = reader.readUInt32LE();
    // Confirmed real value (cross-checked against wow.export's own ROOT_MAGIC
    // constant): the "MFST" tag is stored reversed on disk, same convention
    // as WDT/ADT chunk FourCCs, so a plain LE uint32 read gives 0x4D465354.
    const MFST = 0x4d465354;

    // Modern (8.2+) root format with an MFST header. Forever's client (a
    // modern-engine build, confirmed in docs/PROJECT_RECON.md) uses this format.
    if (magic === MFST) {
      let headerSize = reader.readUInt32LE();
      let version = reader.readUInt32LE();
      let totalFileCount: number;
      let namedFileCount: number;

      if (headerSize !== 0x18) {
        version = 0;
        totalFileCount = headerSize;
        namedFileCount = 0;
        headerSize = 12;
      } else {
        if (version !== 1 && version !== 2) throw new Error(`Root file: unknown version ${version}`);
        totalFileCount = reader.readUInt32LE();
        namedFileCount = reader.readUInt32LE();
      }
      reader.seek(headerSize);

      const allowNameless = totalFileCount !== namedFileCount;

      while (reader.remainingBytes > 0) {
        const numRecords = reader.readUInt32LE();
        let contentFlags: number;
        let localeFlags: number;

        if (version === 0 || version === 1) {
          contentFlags = reader.readUInt32LE();
          localeFlags = reader.readUInt32LE();
        } else {
          localeFlags = reader.readUInt32LE();
          const c1 = reader.readUInt32LE();
          const c2 = reader.readUInt32LE();
          const c3 = reader.readUInt8();
          contentFlags = c1 | c2 | (c3 << 17);
        }

        const fileDataIDs = new Array<number>(numRecords);
        let fileDataID = 0;
        for (let i = 0; i < numRecords; i++) {
          const next = fileDataID + reader.readInt32LE();
          fileDataIDs[i] = next;
          fileDataID = next + 1;
        }

        for (let i = 0; i < numRecords; i++) {
          const key = reader.readHexString(16);
          let entry = this.rootEntries.get(fileDataIDs[i]);
          if (!entry) {
            entry = { byType: new Map() };
            this.rootEntries.set(fileDataIDs[i], entry);
          }
          entry.byType.set(this.rootTypes.length, key);
        }

        const noNameHash = (contentFlags & 0x10000000) !== 0; // ContentFlag.NoNameHash
        if (!(allowNameless && noNameHash)) reader.move(8 * numRecords);

        this.rootTypes.push({ contentFlags, localeFlags });
      }
    } else {
      // Legacy (pre-8.2) root format, no magic header.
      reader.seek(0);
      while (reader.remainingBytes > 0) {
        const numRecords = reader.readUInt32LE();
        const contentFlags = reader.readUInt32LE();
        const localeFlags = reader.readUInt32LE();

        const fileDataIDs = new Array<number>(numRecords);
        let fileDataID = 0;
        for (let i = 0; i < numRecords; i++) {
          const next = fileDataID + reader.readInt32LE();
          fileDataIDs[i] = next;
          fileDataID = next + 1;
        }

        for (let i = 0; i < numRecords; i++) {
          const key = reader.readHexString(16);
          reader.move(8); // name hash
          let entry = this.rootEntries.get(fileDataIDs[i]);
          if (!entry) {
            entry = { byType: new Map() };
            this.rootEntries.set(fileDataIDs[i], entry);
          }
          entry.byType.set(this.rootTypes.length, key);
        }

        this.rootTypes.push({ contentFlags, localeFlags });
      }
    }
  }

  /** Reads and fully decompresses a file by its DB2-referenced FileDataID (e.g. Map.WdtFileDataID). */
  getFileByFileDataId(fileDataID: number): Buffer {
    const entry = this.rootEntries.get(fileDataID);
    if (!entry) throw new Error(`FileDataID ${fileDataID} not found in root`);

    // A FileDataID can have more than one root entry that equally satisfies
    // the locale/violence filter — confirmed empirically (root-entry-probe.ts
    // against real ground-texture FileDataIDs): two candidates with the same
    // locale, one whose encoding key resolves to a local archive entry and
    // one that doesn't. Picking the first candidate regardless of whether
    // it's actually present locally meant this could always land on the
    // absent sibling even when the other candidate was sitting right there
    // on disk (this is exactly what was happening for ground textures,
    // which always have this ambiguity; minimap tiles have only one root
    // entry and never triggered it). Try every matching candidate and use
    // the first one that's actually resolvable end-to-end.
    let firstEncodingError: Error | undefined;
    for (const [typeIdx, contentKey] of entry.byType) {
      const type = this.rootTypes[typeIdx];
      if ((type.localeFlags & LOCALE_ENUS) === 0 || (type.contentFlags & CONTENT_FLAG_LOW_VIOLENCE) !== 0) continue;

      const encodingKey = this.encodingKeys.get(contentKey);
      if (!encodingKey) continue;
      if (!this.localIndexes.has(encodingKey.substring(0, 18))) continue;

      return decodeBlte(this.readArchiveByKey(encodingKey));
    }

    // Nothing resolved end-to-end — fall through to the original, simpler
    // resolution once more so the thrown error names the real reason
    // (no matching root entry vs. no encoding entry vs. genuinely absent).
    for (const [typeIdx, contentKey] of entry.byType) {
      const type = this.rootTypes[typeIdx];
      if ((type.localeFlags & LOCALE_ENUS) === 0 || (type.contentFlags & CONTENT_FLAG_LOW_VIOLENCE) !== 0) continue;
      const encodingKey = this.encodingKeys.get(contentKey);
      if (!encodingKey) {
        firstEncodingError ??= new Error(`FileDataID ${fileDataID}: no encoding entry for content key ${contentKey}`);
        continue;
      }
      return decodeBlte(this.readArchiveByKey(encodingKey));
    }
    throw firstEncodingError ?? new Error(`FileDataID ${fileDataID}: no enUS/non-low-violence root entry`);
  }

  private readArchiveByKey(encodingKeyHex: string): Buffer {
    const indexEntry = this.localIndexes.get(encodingKeyHex.substring(0, 18));
    if (!indexEntry) throw new Error(`Encoding key ${encodingKeyHex} not found in local archive indexes`);

    const archivePath = join(this.storageDir, `data.${String(indexEntry.archiveIndex).padStart(3, "0")}`);
    const fd = openSync(archivePath, "r");
    try {
      // The real per-entry payload starts 0x1E (30) bytes after the index
      // offset — a fixed local-archive entry header wow.export's own
      // getDataFile() confirms and this project verified against real data.
      const length = indexEntry.size - 0x1e;
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, indexEntry.offset + 0x1e);
      return buf;
    } finally {
      closeSync(fd);
    }
  }

  private formatConfigPath(key: string): string {
    return join(this.dataDir, "config", key.substring(0, 2), key.substring(2, 4), key);
  }
}
