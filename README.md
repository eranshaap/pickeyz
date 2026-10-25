# findCar

A used-car search for the Israeli market that ranks every car in a search and puts three picks on top. Every listing is checked against the official vehicle registry, and every pick is explained in plain language.

Built solo, August–October 2026. Not in active development.

## What it does

A buyer searches for a model, optionally with a budget and model years. Every matching car is ranked, and three picks go on top:

- **Best deal**: the best value against comparable cars on the market
- **Peace of mind**: the strongest condition indicators
- **Cheapest**: the lowest price that still clears a condition floor

Each pick comes with short reasons generated from the data behind it. Every listing is checked against the Ministry of Transport registry: the advertised mileage against the last annual test, the ownership history, and whether the car is still registered. The interface is in Hebrew (right to left).

## How the ranking works

Scoring runs offline as a pipeline of scripts, and the site reads the stored results.

1. **Import.** Listings are imported from a collection workbook. Each plate is looked up in the Ministry of Transport datasets on [data.gov.il](https://data.gov.il), and the raw answer is cached as evidence.
2. **Refresh.** Known cars are re-fetched through a pure acceptance gate. Each answer is either accepted and written in full, or rejected with a reason; nothing is half-written.
3. **Market norms.** For every comparison group (same model, body, engine, gearbox and trim) and model year: the median price, mileage and ownership history over a 90-day window, widened to 180 days when a group is thin. The norm tables are append-only and versioned.
4. **Scoring.** Every component is in one unit, percent of the car's value, positive in the buyer's favor:
   - *Price advantage*: the asking price against the median of comparable cars. With too few comparables, it falls back to the car's new price, walked down a depreciation curve fitted to the pool.
   - *Condition*: mileage against the median, plus ownership history against what is typical for the group.
   - *Deal score* = price advantage + condition relative to typical.

   Each listing also gets a confidence level and cross-checks between the ad and the registry.
5. **Selection.** For each search, a selection library picks the three categories under explicit eligibility rules. For example, a pick needs a verified ownership history, and a pool too small to compare crowns nothing.
6. **Explanations.** A generator turns the facts behind each pick into short sentences.

## Engineering

- **Dry run by default.** Every script that touches data prints what it would do; only `--write` changes the database.
- **Versioned engine.** Scores carry engine and rules versions, and a dry scoring run compares new results with the stored ones before anything is written.
- **Tests.** 1,600+ automated tests on the core logic (`npm test`, Node's test runner with tsx).
- **Schema.** 19 Prisma models, 35 migrations.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL on Supabase · Prisma 7 · Vercel

## Project structure

```
src/app                 pages, the listing page and server actions
src/components          search, results and car-page UI
src/lib/mot             Ministry of Transport data access
src/lib/scoring         the scoring engine
src/lib/selection       the three-pick selection
src/lib/justification   the reasons generator
src/lib/search          search and filtering
scripts                 import, refresh, norms, scoring and measurement tools
prisma                  schema and migrations
```

## Running it

```bash
npm install
npm test
```

The app itself needs a PostgreSQL database (`DATABASE_URL`, `DIRECT_URL`) and data to show. The collected listing data and the car photos are not part of this repository, so a fresh clone runs the tests but has no inventory.

## How it was built

Built solo with Claude Code as the coding agent. [AGENTS.md](AGENTS.md) holds the working rules the agent follows: fail loudly, make no product decisions, and run every data change as a dry run first.

## Data

Vehicle data: Israel Ministry of Transport open datasets, via data.gov.il.
