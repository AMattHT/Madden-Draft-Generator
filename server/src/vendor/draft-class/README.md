# Vendored .mdc engine

Plain-Node parsers/writers for Madden draft-class files, vendored from the sibling
Madden Editor Suite and kept minimal:

| File | Role |
|---|---|
| `M26Parser.js` / `M26Writer.js` | Madden 26 `CAREERDRAFT-*`: 4296-byte blocks (4096-byte zstd visual JSON + 200-byte attribute section). The writer merges into a donor template block; loadout elements may carry `remove: true` to drop a donor slot. |
| `M27Parser.js` / `M27Writer.js` | Madden 27: 5876-byte blocks (5632-byte uncompressed visual JSON + 244-byte attribute section), header prospect count at `0x42`, field map documented in the parser header and `M27-PORT.md`. |
| `FileParser.js` | Byte helpers used by the M26 parser. |

The legacy `DraftClassParser` (4322-byte model), `Decompressor`, `M25toM26Converter`
and `draftClassFunctions` were removed on 2026-08-22: nothing imported them and the
4322-byte model is exactly the mistake the README warns about. `fzstd` handles the
M26 visual blobs.

Use through `MdcService` / `Mdc27Service` (typed wrappers), never directly.
