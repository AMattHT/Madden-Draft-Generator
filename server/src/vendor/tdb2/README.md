# Vendored TDB2 engine

The Madden 21+ ROSTER payload parser/writer from
[bep713/madden-file-tools](https://github.com/bep713/madden-file-tools) (MIT, LICENSE
alongside), commit 6c7eb93, taken 2026-09-16. Only the TDB2 path is here:
`TDB2Parser` / `TDB2Writer` / `subTableWriter`, the `TDB2*` model classes, the abstract
`File` / `FileParser` / `SimpleParser`, and `utilService` with its sjcl users removed.

Local changes:
- requires flattened to `./`;
- `TDB2Field.isDefaulted` + writer skip (fields that `_normalizeRecords` invented and
  nobody changed are not written; the game omits them too);
- `TDB2Parser` accepts a table with zero records (an emptied injury or depth-chart table).

Use through `services/Tdb2Engine.ts`, never directly.
