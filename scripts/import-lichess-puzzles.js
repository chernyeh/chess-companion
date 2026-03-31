#!/usr/bin/env node
/**
 * LICHESS PUZZLE IMPORTER
 * 
 * Downloads and processes the Lichess puzzle database into
 * filtered JSON files for Chess Companion.
 * 
 * USAGE:
 *   1. Download the puzzle CSV:
 *      wget https://database.lichess.org/lichess_db_puzzle.csv.zst
 * 
 *   2. Decompress it (install zstd first):
 *      Mac:   brew install zstd
 *      Linux: sudo apt install zstd
 *      Then:  zstd -d lichess_db_puzzle.csv.zst
 * 
 *   3. Run this script:
 *      node scripts/import-lichess-puzzles.js lichess_db_puzzle.csv
 * 
 *   4. It will create data/lichess-puzzles.json with ~5000 curated puzzles
 * 
 * The output format matches what Chess Companion expects.
 */

const fs = require('fs');
const readline = require('readline');

const INPUT_FILE = process.argv[2] || 'lichess_db_puzzle.csv';
const OUTPUT_FILE = 'data/lichess-puzzles.json';

// Configuration: what to keep
const MIN_RATING = 400;
const MAX_RATING = 1800;  // Suitable for young players
const MIN_POPULARITY = 80; // Only highly-rated puzzles
const MAX_PUZZLES_PER_THEME = 300;
const MAX_TOTAL = 5000;

// Map Lichess themes to our app themes
const THEME_MAP = {
  'fork': 'fork',
  'pin': 'pin',
  'skewer': 'skewer',
  'backRankMate': 'backRank',
  'discoveredAttack': 'discovered',
  'deflection': 'deflection',
  'sacrifice': 'sacrifice',
  'mateIn1': 'mateIn1',
  'mateIn2': 'mateIn2',
  'hangingPiece': 'hanging',
  'trappedPiece': 'trapped',
  'removingTheDefender': 'removal',
  'overloading': 'overloaded',
  'clearance': 'clearance',
  'intermezzo': 'zwischenzug',
  'endgame': 'endgame',
  'promotion': 'promotion',
  'attraction': 'deflection',
  'doubleCheck': 'discovered',
  'quietMove': 'clearance',
  'zugzwang': 'endgame',
  'exposedKing': 'fork',
};

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`
╔══════════════════════════════════════════════════════╗
║  LICHESS PUZZLE IMPORTER                             ║
║                                                      ║
║  File not found: ${INPUT_FILE.padEnd(35)}║
║                                                      ║
║  To get the puzzle database:                         ║
║                                                      ║
║  1. Download (warning: ~300MB compressed):            ║
║     wget https://database.lichess.org/               ║
║          lichess_db_puzzle.csv.zst                    ║
║                                                      ║
║  2. Decompress:                                      ║
║     Mac:   brew install zstd                         ║
║     Linux: sudo apt install zstd                     ║
║     Then:  zstd -d lichess_db_puzzle.csv.zst         ║
║                                                      ║
║  3. Run again:                                       ║
║     node scripts/import-lichess-puzzles.js \\         ║
║       lichess_db_puzzle.csv                          ║
╚══════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  console.log('Reading Lichess puzzle database...');
  
  const themeBuckets = {};
  let processed = 0;
  let kept = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    processed++;
    
    if (processed % 500000 === 0) {
      console.log(`  Processed ${(processed/1000000).toFixed(1)}M puzzles, kept ${kept}...`);
    }

    // Parse CSV line
    // Format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
    const parts = line.split(',');
    if (parts.length < 8) continue;

    const [puzzleId, fen, moves, ratingStr, rdStr, popStr, playsStr, themesStr] = parts;
    const rating = parseInt(ratingStr);
    const popularity = parseInt(popStr);
    const rd = parseInt(rdStr);

    // Filter
    if (rating < MIN_RATING || rating > MAX_RATING) continue;
    if (popularity < MIN_POPULARITY) continue;
    if (rd > 100) continue; // Skip puzzles with uncertain ratings
    
    // Parse themes
    const lichessThemes = themesStr.split(' ').filter(Boolean);
    const appThemes = lichessThemes
      .map(t => THEME_MAP[t])
      .filter(Boolean);
    
    if (appThemes.length === 0) continue;

    // Parse moves (Lichess format: first move is opponent's, rest are solution)
    const moveList = moves.split(' ');
    if (moveList.length < 2) continue;
    
    // In Lichess puzzles, the first move is the opponent's move that creates the puzzle
    // We need to apply it to get the puzzle position, then the rest are the solution
    const opponentMove = moveList[0];
    const solution = moveList.slice(1);

    // Create puzzle title from themes
    const mainTheme = appThemes[0];
    const themeLabel = mainTheme.charAt(0).toUpperCase() + mainTheme.slice(1);
    const title = `${themeLabel} #${puzzleId.slice(-4)}`;

    const puzzle = {
      id: `lp_${puzzleId}`,
      fen: fen,         // FEN before opponent's move
      setupMove: opponentMove,  // Apply this first to get puzzle position
      sol: solution,
      th: [...new Set(appThemes)],
      r: rating,
      t: title,
    };

    // Distribute into theme buckets
    for (const theme of appThemes) {
      if (!themeBuckets[theme]) themeBuckets[theme] = [];
      if (themeBuckets[theme].length < MAX_PUZZLES_PER_THEME) {
        themeBuckets[theme].push(puzzle);
      }
    }
    kept++;
    
    if (kept >= MAX_TOTAL * 3) break; // Over-collect, then deduplicate
  }

  // Deduplicate and balance
  const seen = new Set();
  const final = [];
  
  // Take proportionally from each theme
  const themeNames = Object.keys(themeBuckets);
  const perTheme = Math.ceil(MAX_TOTAL / themeNames.length);
  
  for (const theme of themeNames) {
    const bucket = themeBuckets[theme]
      .sort((a, b) => b.r - a.r) // Sort by rating descending for variety
      .slice(0, perTheme);
    
    for (const p of bucket) {
      if (!seen.has(p.id) && final.length < MAX_TOTAL) {
        seen.add(p.id);
        final.push(p);
      }
    }
  }

  // Sort by rating
  final.sort((a, b) => a.r - b.r);

  // Write output
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 0));

  console.log(`
╔══════════════════════════════════════════════╗
║  Done! Created ${OUTPUT_FILE.padEnd(30)} ║
║                                              ║
║  Total puzzles: ${String(final.length).padEnd(28)} ║
║  Rating range: ${MIN_RATING}-${MAX_RATING}                      ║
║  Themes: ${themeNames.length.toString().padEnd(36)} ║
║                                              ║
║  Theme distribution:                         ║`);
  
  for (const theme of themeNames.sort()) {
    const count = final.filter(p => p.th.includes(theme)).length;
    console.log(`║    ${(theme + ':').padEnd(20)} ${String(count).padEnd(20)} ║`);
  }
  
  console.log(`╚══════════════════════════════════════════════╝

To use these puzzles in the app, update data/puzzles.ts
to import and merge them with the existing puzzles.
`);
}

main().catch(console.error);
