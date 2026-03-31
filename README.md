# ♞ Chess Companion

A chess training app with **spaced repetition**, **opening tutorials**, **endgame practice**, and **AI coaching**. Built for a family to use together — each player gets their own profile with independent progress tracking.

## Features

- **Tactics Training** — 50+ puzzles (expandable to 5000+) with SM-2 spaced repetition
- **Opening Repertoire** — 10 guided opening tutorials (Italian, Ruy Lopez, Sicilian, French, etc.)
- **Endgame Practice** — 12 fundamental endgame positions with coaching tips
- **Multi-User** — Each family member has their own profile and progress
- **Puzzle Rush** — 3-minute timed mode to test speed
- **AI Coach** — Claude explains tactics after each puzzle (optional, ~$1-5/month)
- **Free Static Coaching** — Pre-written tips for every theme (no API needed)
- **Adaptive Difficulty** — Puzzles match your estimated rating
- **Progress Stats** — Track accuracy by theme, streak, rating over time

## Cost

| Component | Cost |
|-----------|------|
| Vercel hosting | Free (Hobby plan) |
| Lichess puzzles | Free (CC0 license) |
| Static coaching tips | Free (built-in) |
| AI Coach (optional) | ~$1-5/month |
| **Total** | **$0-5/month** |

---

## 🚀 Deployment Guide (Step by Step)

### Prerequisites

You need a computer (Mac, Windows, or Linux) with internet access. That's it.

### Step 1: Install Node.js

Go to **https://nodejs.org** and download the **LTS** version (the big green button). Run the installer — click through all the defaults.

To verify it worked, open your terminal:
- **Mac**: Open "Terminal" (search for it in Spotlight)
- **Windows**: Open "Command Prompt" or "PowerShell" (search in Start menu)

Type:
```bash
node --version
```
You should see something like `v20.x.x`. If you do, Node.js is installed!

### Step 2: Install Git

Go to **https://git-scm.com** and download the installer for your OS. Run it with default settings.

Verify:
```bash
git --version
```

### Step 3: Create accounts (free)

1. **GitHub** — Go to https://github.com and sign up (free)
2. **Vercel** — Go to https://vercel.com and click "Sign Up" → "Continue with GitHub"
3. **Anthropic** (optional, for AI coaching) — Go to https://console.anthropic.com and sign up

### Step 4: Download this project

Open your terminal and navigate to where you want to keep the project:

```bash
cd ~/Desktop
```

Then clone or create the project. If you received this as a zip file, unzip it. Otherwise:

```bash
# Create the project folder
mkdir chess-companion
cd chess-companion
```

Copy all the files from this project into that folder.

### Step 5: Install dependencies

In your terminal, inside the chess-companion folder:

```bash
npm install
```

This downloads all the libraries the app needs. It takes about 30-60 seconds.

### Step 6: Set up environment variables (optional)

If you want AI coaching, copy the example file:

```bash
cp .env.local.example .env.local
```

Open `.env.local` in any text editor and replace `sk-ant-your-key-here` with your actual Anthropic API key from https://console.anthropic.com/settings/keys

**If you skip this step**, the app still works perfectly — you just won't have AI coaching (the "Quick Tip" button still works using built-in tips).

### Step 7: Test locally

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. You should see the Chess Companion app! Try creating a player profile and solving a puzzle.

Press `Ctrl+C` in the terminal to stop the local server when you're done testing.

### Step 8: Create a GitHub repository

1. Go to https://github.com/new
2. Name it `chess-companion`
3. Keep it **Public** (required for Vercel free tier)
4. Don't check any boxes (no README, no .gitignore — we already have them)
5. Click "Create repository"

### Step 9: Push your code to GitHub

In your terminal:

```bash
git init
git add .
git commit -m "Chess Companion v1"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/chess-companion.git
git push -u origin main
```

Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username.

GitHub may ask you to log in — follow the prompts.

### Step 10: Deploy to Vercel

1. Go to **https://vercel.com/new**
2. Find your `chess-companion` repo and click **Import**
3. Vercel auto-detects it's a Next.js project
4. **Before clicking Deploy**, expand "Environment Variables" and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your API key (or skip this if you don't want AI coaching)
5. Click **Deploy**
6. Wait about 60 seconds

**You're live!** Vercel gives you a URL like `chess-companion-xyz.vercel.app`. Share this with your family!

### Step 11: Future updates

Whenever you make changes to the code:

```bash
git add .
git commit -m "Description of what you changed"
git push
```

Vercel automatically redeploys within 60 seconds. No manual steps needed!

---

## 📦 Adding More Puzzles from Lichess

The app comes with ~50 built-in puzzles. To add thousands more from Lichess's free database:

### Quick method (recommended)

1. Install zstd decompressor:
   - Mac: `brew install zstd`
   - Linux: `sudo apt install zstd`
   - Windows: Download from https://github.com/facebook/zstd/releases

2. Download the puzzle database (~300MB compressed):
```bash
wget https://database.lichess.org/lichess_db_puzzle.csv.zst
```

3. Decompress:
```bash
zstd -d lichess_db_puzzle.csv.zst
```

4. Run the import script:
```bash
node scripts/import-lichess-puzzles.js lichess_db_puzzle.csv
```

5. This creates `data/lichess-puzzles.json` with ~5000 curated puzzles, filtered for:
   - Rating 400-1800 (suitable for young players)
   - Popularity score above 80 (community-validated quality)
   - Balanced across all tactical themes

6. To use them in the app, update `data/puzzles.ts` to import and merge the JSON.

---

## 🧠 AI Coach Setup

The AI Coach uses Claude Haiku (Anthropic's fastest, cheapest model) to explain tactics.

**Cost estimate**: At ~$1 per million input tokens, even 100 coaching explanations per day would cost about $3-5/month. Typical family usage would be under $1/month.

**To control costs**:
- Use the "Quick Tip" button (free, uses built-in tips) for most puzzles
- Reserve "AI Coach" for puzzles where the static tip isn't enough
- The app works completely without AI coaching enabled

---

## 🗂️ Project Structure

```
chess-companion/
├── app/
│   ├── layout.tsx        ← HTML wrapper
│   ├── page.tsx          ← Main app (all the chess logic)
│   ├── globals.css       ← Styles
│   └── api/
│       └── coach/
│           └── route.ts  ← AI Coach API (calls Anthropic)
├── data/
│   └── puzzles.ts        ← All puzzles, openings, endgames, coaching tips
├── scripts/
│   └── import-lichess-puzzles.js  ← Lichess puzzle importer
├── package.json
├── next.config.js
├── tsconfig.json
├── .env.local.example
├── .gitignore
└── README.md
```

---

## 🎯 Future Ideas

- [ ] Import games from Lichess for AI analysis
- [ ] Achievement badges
- [ ] Weekly progress email
- [ ] Parent dashboard
- [ ] Print puzzles as PDF worksheets
- [ ] Opening explorer linking puzzles to their openings
- [ ] Blindfold mode (hide pieces after 5 seconds)
- [ ] Multiplayer puzzle race

---

## License

Puzzle data from Lichess is CC0 (public domain). App code is MIT.
