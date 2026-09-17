/** One player's pending edits (same shape as the web's PlayerFieldEdit). */
export interface PlayerFieldEdit {
  overall?: number;
  age?: number;
  position?: string;   // Madden 27 label: QB HB FB WR TE LT LG C RG RT LEDG REDG DT SAM MIKE WILL CB FS SS K P LS
  dev?: string;        // Normal | Star | Superstar | XFactor
  jersey?: number;
  ratings?: Record<string, number>;
  bodyType?: string;   // Standard | Thin | Muscular | Heavy | Lean
  genericHead?: string; // gen_<tone>_...
  gear?: Record<string, string>; // GearOptionsService slot -> asset
}

/** A roster document the server can apply: deltas against a base file. */
export interface RosterBuildDoc {
  baseName: string;                  // ROSTER-* file in the Madden 27 saves folder
  name: string;                      // roster name; the output is ROSTER-<NAME>
  moves?: Record<string, number>;    // PGID -> TGID (the free-agent team id cuts)
  edits?: Record<string, PlayerFieldEdit>; // PGID -> edits
}

export interface ApplyCounts { moved: number; cut: number; edited: number; skipped: string[] }

export interface RosterBuildResult extends ApplyCounts {
  input: string;
  output: string;
  outputPath: string;
}
