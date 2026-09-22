import { describe, expect, it } from "vitest";
import { parseBuildInfo, parseKeyValueConfig } from "../src/casc/config-parser.js";

describe("parseBuildInfo", () => {
  it("parses the real .build.info shape (pipe-delimited, typed headers)", () => {
    const text =
      "Branch!STRING:0|Build Key!HEX:16|Product!STRING:0\n" +
      "us|6c0df97e8e481a9a41600e373367c200|wow_classic_beta\n" +
      "eu|3645f0fe9dc5215ea90eaf7cdb7379ce|wow_classic_era\n";
    const rows = parseBuildInfo(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      Branch: "us",
      BuildKey: "6c0df97e8e481a9a41600e373367c200",
      Product: "wow_classic_beta",
    });
  });

  it("skips blank lines", () => {
    const text = "A!STRING:0|B!STRING:0\nfoo|bar\n\n";
    expect(parseBuildInfo(text)).toHaveLength(1);
  });
});

describe("parseKeyValueConfig", () => {
  it("parses BuildConfig/CDNConfig's '# header' + 'key = value' format", () => {
    const text = "# Build Configuration\n\nroot = abc123\nencoding = def456 ghi789\nencoding-size = 100 200\n";
    const config = parseKeyValueConfig(text);
    expect(config.root).toBe("abc123");
    expect(config.encoding).toBe("def456 ghi789");
    // Hyphenated keys are camelCased, matching CASC config convention.
    expect(config.encodingSize).toBe("100 200");
  });

  it("ignores comment and blank lines", () => {
    const text = "# header\n# another comment\n\nkey = value\n";
    expect(parseKeyValueConfig(text)).toEqual({ key: "value" });
  });
});
