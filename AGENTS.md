<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working rules for agents
- Fail loudly. Never skip a row, swallow an error, or turn an unknown value into null to keep a run going. Stop, print what stopped you and where (file, row, plate), and wait.
- No product decisions. If a fix requires choosing a rule that is not written in findCar-plan.md, findCar-schema.md or the script's own header comment (for example: what to do with a row that has no price, or with a car whose model is missing from the catalog), stop and ask instead of choosing.
- Fix errors, not logic. Compile and runtime errors in a script are yours to fix; changing what the script does with the data is not. If the correct fix changes behavior, say so and wait.
- Writes need an explicit instruction. Run scripts with --dry-run unless the instruction says to write. Never run migrations, deletes, or bulk updates on your own initiative.