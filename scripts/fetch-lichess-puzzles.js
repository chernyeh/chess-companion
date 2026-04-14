#!/usr/bin/env node
/**
 * fetch-lichess-puzzles.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches validated puzzles from the Lichess API and converts them to the
 * Chess Companion format. All puzzles come pre-validated by Lichess — their
 * solutions are computer-verified and rated by thousands of players.
 *
 * USAGE (requires a free Lichess API token):
 *   1. Create a free account at https://lichess.org
 *   2. Generate a personal API token at https://lichess.org/account/oauth/token
 *      (no special permissions needed — read-only is fine)
 *   3. Run:
 *        LICHESS_TOKEN=lip_xxxx node scripts/fetch-lichess-puzzles.js
 *      or:
 *        node scripts/fetch-lichess-puzzles.js --token lip_xxxx
 *
 * OPTIONS:
 *   --token <token>    Lichess API token (or use LICHESS_TOKEN env var)
 *   --nb <number>      Number of puzzles to fetch (default: 200, max: 200 per call)
 *   --themes <list>    Comma-separated Lichess themes (default: auto-selects all key themes)
 *   --maxRating <n>    Maximum puzzle rating (default: 1600)
 *   --minRating <n>    Minimum puzzle rating (default: 400)
 *   --out <file>       Output file (default: data/lichess-puzzles.json)
 *
 * The output JSON can be imported into data/puzzles.ts by replacing or extending
 * the TACTICS array.
 *
 * LICHESS PUZZLE THEMES (useful ones for this app):
 *   fork, pin, skewer, backRankMate, discoveredAttack, deflection, sacrifice,
 *   mateIn1, mateIn2, hangingPiece, trappedPiece, endgame, promotion,
 *   overloadedPiece, clearance, zugzwang, kingsideAttack, queensideAttack
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : defaultVal;
}

const TOKEN = getArg("token", process.env.LICHESS_TOKEN || "");
const NB = Math.min(200, parseInt(getArg("nb", "200"), 10));
const MAX_RATING = parseInt(getArg("maxRating", "1600"), 10);
const MIN_RATING = parseInt(getArg("minRating", "400"), 10);
const OUT_FILE = getArg("out", path.join(__dirname, "../data/lichess-puzzles.json"));

// Themes to fetch in batches (Lichess theme names)
const THEME_BATCHES = getArg("themes", null)
  ? [getArg("themes", "").split(",")]
  : [
      ["mateIn1", "mateIn2"],
      ["fork", "pin", "skewer"],
      ["discoveredAttack", "deflection", "sacrifice"],
      ["backRankMate", "hangingPiece", "trappedPiece"],
      ["endgame", "promotion"],
    ];

// ── Theme mapping: Lichess name → app theme key ───────────────────────────────
const THEME_MAP = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  backRankMate: "backRank",
  discoveredAttack: "discovered",
  deflection: "deflection",
  sacrifice: "sacrifice",
  mateIn1: "mateIn1",
  mateIn2: "mateIn2",
  hangingPiece: "hanging",
  trappedPiece: "trapped",
  removeDefender: "removal",
  overloadedPiece: "overloaded",
  clearance: "clearance",
  zwischenzug: "zwischenzug",
  endgame: "endgame",
  promotion: "promotion",
  kingsideAttack: "sacrifice",
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      headers: { Accept: "application/json", ...headers },
    };
    https.get(reqOpts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on("error", reject);
  });
}

// ── Convert Lichess puzzle to Chess Companion format ──────────────────────────
let idCounter = 1;

function convertPuzzle(lp) {
  const themes = (lp.puzzle?.themes || [])
    .map((t) => THEME_MAP[t])
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  if (themes.length === 0) themes.push("endgame");

  const rating = lp.puzzle?.rating || 800;
  const sol = lp.puzzle?.solution || [];

  // Derive a human-readable title from the first theme
  const themeLabels = {
    fork: "Fork", pin: "Pin", skewer: "Skewer", backRank: "Back Rank Mate",
    discovered: "Discovered Attack", deflection: "Deflection",
    sacrifice: "Sacrifice", mateIn1: "Mate in 1", mateIn2: "Mate in 2",
    hanging: "Hanging Piece", trapped: "Trapped Piece", removal: "Remove Guard",
    overloaded: "Overloaded", clearance: "Clearance", zwischenzug: "Zwischenzug",
    endgame: "Endgame", promotion: "Promotion",
  };
  const primaryTheme = themes[0];
  const title = themeLabels[primaryTheme] || "Tactic";

  // The FEN in the Lichess API is the position BEFORE the opponent's last move.
  // The puzzle solution starts from this FEN.
  const fen = lp.game?.fen || lp.puzzle?.fen || "";

  return {
    id: `lc${String(idCounter++).padStart(4, "0")}`,
    fen,
    sol,
    th: themes,
    r: rating,
    t: title,
    desc: `Find the best ${themes.includes("mateIn1") ? "checkmate" : themes.includes("mateIn2") ? "forced checkmate" : "move"} in this position. Think carefully about what your opponent cannot do after your move.`,
    goal: `Solution: ${sol.slice(0, 2).join(" → ")}${sol.length > 2 ? ` → ${sol.slice(2).join(" → ")}` : ""}. This puzzle was validated by thousands of Lichess players (rating: ${rating}).`,
    // source URL so players can review on Lichess
    _lichessId: lp.puzzle?.id,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error(`
ERROR: Lichess API token required.

How to get one (free, takes 1 minute):
  1. Create a free account at https://lichess.org
  2. Go to https://lichess.org/account/oauth/token
  3. Click "Generate a personal token" (no permissions needed)
  4. Copy the token and run:

     LICHESS_TOKEN=lip_xxxx node scripts/fetch-lichess-puzzles.js

All fetched puzzles are computer-verified by Lichess — zero wrong solutions!
`);
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${TOKEN}` };
  const allPuzzles = [];
  const seen = new Set();

  console.log(`\nFetching up to ${NB} puzzles per theme batch from Lichess...\n`);

  for (const themes of THEME_BATCHES) {
    const themeStr = themes.join(",");
    const url = `https://lichess.org/api/puzzle/batch/next?nb=${Math.ceil(NB / THEME_BATCHES.length)}&themes=${themeStr}`;

    try {
      console.log(`  Fetching themes: ${themeStr}...`);
      const data = await fetchJson(url, headers);
      const puzzles = data.puzzles || [];

      let added = 0;
      for (const lp of puzzles) {
        const rating = lp.puzzle?.rating || 0;
        const id = lp.puzzle?.id;
        if (!id || seen.has(id)) continue;
        if (rating < MIN_RATING || rating > MAX_RATING) continue;
        if (!lp.puzzle?.solution?.length || !lp.game?.fen) continue;

        seen.add(id);
        allPuzzles.push(convertPuzzle(lp));
        added++;
      }
      console.log(`    → Added ${added} puzzles (${puzzles.length} received, filtered by rating ${MIN_RATING}–${MAX_RATING})`);

      // Brief pause to be polite to the API
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.error(`    ✗ Failed for themes [${themeStr}]: ${err.message}`);
    }
  }

  if (allPuzzles.length === 0) {
    console.error("\nNo puzzles fetched. Check your token and internet connection.");
    process.exit(1);
  }

  // Sort by rating for difficulty ordering
  allPuzzles.sort((a, b) => a.r - b.r);

  fs.writeFileSync(OUT_FILE, JSON.stringify(allPuzzles, null, 2));

  console.log(`
✅ Done! ${allPuzzles.length} Lichess-validated puzzles saved to:
   ${OUT_FILE}

TO USE IN THE APP:
  Option A — Replace hand-crafted tactics:
    In data/puzzles.ts, replace the TACTICS array contents with the
    imported puzzles (import the JSON and spread it in).

  Option B — Add alongside existing puzzles:
    import lichessPuzzles from './lichess-puzzles.json';
    export const TACTICS: Puzzle[] = [...TACTICS_BUILTIN, ...lichessPuzzles];

Rating range in this batch: ${allPuzzles[0].r} – ${allPuzzles[allPuzzles.length - 1].r}
Themes covered: ${[...new Set(allPuzzles.flatMap((p) => p.th))].join(", ")}
`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
