# Roster and draft rating parity (1.5.1)

Historical pool additions use the same enriched player data and Madden 27 generation pipeline as their default entry-year draft class. Career uses career performance; Realistic uses the full class's rookie rating distribution. The default combined AFL/NFL class is used for 1960–1966 when it contains the player. Other league rows retain their league. A player outside the 402-slot limit uses the draft editor's forced Include behavior.

The roster document stores `mode` (`retro` or `madden`); missing mode means Career for compatibility. Every pool addition is regenerated under that mode for preview and export. Manual edits overlay generation, so changing modes preserves custom attributes, OVR, position, appearance, jersey and team assignments. Base-file players retain their original values unless edited. Custom draft strength, hindsight, variants and manual draft edits are not imported into rosters.

The pool uses the same career enrichment and entry-year position assignment. Its Career column is a career-strength score, not a Realistic rookie OVR. Actual and predicted wAV retain the distinction used in draft classes. Added players' profile cards carry their entry year and wAV rather than inferring the year from veteran age.

Corrected data:

- Tony Romo: career wAV 95, sourced from [Pro Football Reference](https://www.pro-football-reference.com/players/R/RomoTo00.htm), checked September 26, 2026.
- Troy Polamalu: SS, preserved by a curated override even before the initial depth-chart download completes.

First-run provisional previews and catalogs are refreshed as depth-chart data becomes available. Requests and caches are separated by lens so an old response cannot overwrite another lens.

Regression coverage compares every included player in every default year class under both lenses (61,930 player/lens combinations in the current data). Additional tests cover forced inclusion, cache readiness, API mode validation, temporary-file roster exports, and manual-edit preservation. Existing saved roster projects pick up these changes when reopened and re-exported; an already exported game file does not change automatically.
