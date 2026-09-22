# Importer: wow-client

**Status: real, tested, and run against a live local install.** This
package reads World of Warcraft's local CASC game-data storage directly —
no `wow.export` GUI process involved — and extracts real in-game minimap
textures for the Burning Steppes/Searing Gorge vertical slice.

This exists because of explicit user feedback that the app needed to show
*actual* map imagery, not just accurate zone boundaries or generated biome
colors (see `docs/MAP_ARCHITECTURE.md`'s original assessment that this
needed either a licensed client install or another legitimate image
source). The user confirmed they have WoW: Forever installed locally, which
is exactly that legitimate source.

## Why this doesn't just shell out to wow.export

`wow.export` is a GUI desktop application (Electron/NW.js) — there is no
CLI/headless mode, and this project has no tool capable of driving a native
Windows GUI. Rather than ask the user to click through export menus by
hand, this package reads the same underlying CASC storage format directly.

## Attribution (important — read before modifying this package)

`wow.export` (https://github.com/Kruithne/wow.export) is MIT-licensed,
copyright Kruithne and Marlamin. This package's understanding of the binary
formats involved (CASC local storage layout, `.idx` index files, the
encoding-table and root-file formats, BLTE block decompression, and the
BLP2 texture format) came from **reading** that project's source
(`src/js/casc/*.js`, `src/js/buffer.js`), not from independent
reverse-engineering.

What's here is **not a copy** of that code, for a concrete reason: the
original is deeply coupled to wow.export's own Electron/Vue application
internals (a `core` reactive event bus, a large general-purpose
`BufferWrapper` class with WebP/canvas/crc32 helpers this project doesn't
need, a native `mmap` addon for a listfile feature this project
deliberately doesn't use — see below). Copying it verbatim would have
meant either dragging in that whole application shell or leaving dead,
confusing references to a UI framework this is not part of. Instead, every
file here is an original TypeScript implementation of the *logic* (the
binary formats), built and debugged against this project's own real local
install rather than against wow.export's test suite.

Per MIT's terms, that reuse is still real reuse of a copyrighted work's
expression (the specific algorithms/format layouts, not just uncopyrightable
facts about a file format), so:
- This file, and the header comment in every source file that ports
  wow.export logic, records the attribution.
- `wow.export`'s own MIT license text is reproduced in full at the bottom
  of this file.
- If you redistribute this package, keep this attribution.

**Deliberately not ported** (and why):
- `listfile.js`'s path→FileDataID lookup system (27KB of logic, backed by
  a native `mmap` addon) — this project only ever reads files by
  FileDataID (e.g. `Map.WdtFileDataID`, already known from wago.tools DB2
  data), so path-based lookup was never needed.
- Salsa20 decryption (`salsa20.js`, `tact-keys.js`) — minimap textures are
  not encrypted in practice; `blte.ts` throws a clear error if an encrypted
  block is ever encountered rather than silently mishandling it.
- CDN/remote streaming (`casc-source-remote.js`, `cdn-resolver.js`) — this
  package only reads a local install; no fallback-to-CDN logic exists.

## What it does

1. Reads `.build.info` at the install root to find the `wow_classic_beta`
   product's Build Key.
2. Reads the BuildConfig (`Data/config/...`), the local archive indexes
   (`Data/data/*.idx`), the encoding table, and the root file — the same
   sequence wow.export's `CASCLocal.load()` follows.
3. Given a FileDataID (e.g. `775971`, Eastern Kingdoms' `Map.WdtFileDataID`
   — already confirmed real via `importers/wago`), resolves it through
   root → encoding → local archive index → BLTE-decompresses the result.
4. Parses the WDT's `MAID` chunk to find each ADT tile's minimap texture
   FileDataID. **The exact field layout was verified empirically against
   real data this session** (8 fields per tile record, not the 7 initially
   assumed from memory — confirmed by fetching a real tile's 8 raw
   FileDataIDs and checking which ones resolved to valid `BLP2` files).
5. Decodes the BLP2 texture (paletted, DXT-compressed, or raw BGRA) to
   RGBA, and encodes it as PNG (a small from-scratch encoder — no
   dependency needed since Node's built-in `zlib` does the compression).
6. Stitches a zone's full tile range into one composite image.

Run it: `npm run extract:minimaps --workspace=@atlas/importer-wow-client`
(reads `WOW_INSTALL_DIR` env var, defaults to the standard Windows install
path).

## Extracted game art in this repo

The extracted PNGs (`apps/web/public/data/tiles/*.png`) are rendered
Blizzard game textures. This project committed them to the public repo on
the project owner's explicit decision, consistent with how the rest of
the WoW fan-tool ecosystem operates in practice (Wowhead, wow.export
itself, Wowpedia, and many other community sites host extracted client
textures/icons/models under Blizzard's long-standing tolerance of
non-commercial fan content) — the same posture `docs/DATA_PROVENANCE.md`
already documents for DB2 data generally. If that judgment call ever needs
revisiting (e.g. before a commercial launch, or if Blizzard's posture
changes), regenerate is one command away: `npm run extract:minimaps
--workspace=@atlas/importer-wow-client` (needs your own licensed client
install).

This package's own unit tests still don't use real extracted BLP/PNG data
as fixtures, on unrelated grounds — `test/blp.test.ts` and
`test/png.test.ts` build tiny synthetic images by hand so the format logic
is verifiable without depending on any specific real texture's exact
bytes. The one test that touches real game data
(`test/local-casc.integration.test.ts`) reads directly from your local
install and is skipped automatically on any machine without one (e.g. CI).

## wow.export license (MIT)

```
MIT License

Copyright (c) Kruithne <kruithne@gmail.com>
Copyright (c) Marlamin <marlamin@marlamin.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
