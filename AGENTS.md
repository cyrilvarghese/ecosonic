<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## The rulebook is English-first

`docs/remix-rules.md` is authoritative. When a rule changes or is added, edit **only** the English
doc and run `npm run build:rulebook`.

`docs/remix-rules.it.md` is translated **by hand**, on its own schedule. Do not auto-translate it
alongside an English change. The tests allow the Italian to lag: they only check that it never
carries a rule the English lacks, and log which rules it is missing.
