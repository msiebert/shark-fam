---
name: add-shark
description: Add one or more new shark species to Shark Fam end to end - taxonomy clades, species content JSON, 3D model (via the shark-model skill), web-optimized GLB - verifying every fact and name online first, then committing each shark as its own atomic commit. Use when asked to add, create or onboard a new shark species.
---

# Adding sharks

One shark = one commit. A shark is only "added" when the tree, its page, its model and the docs all
agree, and every name and number in it has been checked against sources. Never write from memory alone.

Input is one or more species (common or Latin name). If several, do them **strictly one at a time**:
research, build, verify, commit, then start the next. Never batch two sharks into one commit.

## 0. Preflight
```bash
git status --short                      # must be clean; stash or ask if not
ls pipeline/species content/species content/clades
test -x .venv/bin/python || (python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt)
test -d node_modules || npm install
```
Work on the branch the session designates; never commit to `main` directly. Do not open a PR unless asked.

## 1. Research and verify online (before writing any file)
Use WebSearch/WebFetch. Collect, for the species, from **at least two independent sources**, one of
which should be authoritative: FishBase, IUCN Red List, Eschmeyer's Catalog of Fishes / WoRMS (accepted
names and classification), Florida Museum ISAF, Wikipedia (for the `wikipedia` slug and cross-checks).

| Need | Notes |
|---|---|
| Accepted scientific name | Current valid binomial (check WoRMS for synonyms; do not use a superseded name). Exactly two words. |
| Order, family, genus | Current classification. This repo's tree has no superorder; it starts at order. |
| Common name | The widely used English name; note common alternates. |
| Etymology (`meaning`) | **Required** on every clade and species (the schema rejects a missing one). Genus and species epithets, from ETYFish (see below), never guessed or from memory; a Latin name copied from a parent is not enough. Mark uncertain ones with "possibly". An order or family named after a genus should say so (`From Orectolobus: ...`). Keep the repo's style: `Sphyrna “hammer” (Greek sphyra); mokarran, ...`. |
| Typical adult length | Metres, typical adult (not record max). Cite which. Sets `lengthM` and `length_m`. |
| Depth range | Matches the `depth` string style ("Surface to about 300 m"). |
| Diet | Short list; the wording drives companions (`plankton`/`krill`, `rays`/`skates`, `fish`/`squid`). |
| Range | Enough to draw a rough `coast` or `open` polygon in lon/lat. Approximate is fine; it must not be wrong in kind (e.g. do not shade the Atlantic for an Indo-Pacific shark). |
| Wikipedia slug | Fetch `https://en.wikipedia.org/wiki/<slug>` and confirm it resolves to the right species page (not a redirect to a genus or disambiguation). |
| Appearance | Head shape, snout, fin proportions (first dorsal, pectorals, caudal ratio), colour, pattern, countershading, eye size, mouth position, distinctive features. Needed for the model. |

**ETYFish is the reference for every `meaning`** (clades and species alike). Find the entry on etyfish.org
(one page per family, e.g. etyfish.org/sphyrnidae/, covering the family, genus and species names; the
order is covered by its families) and write the meaning as ETYFish states it, keeping its hedges
("presumably", "possibly from"). Cross-check with the English Wikipedia article. If Wikipedia disagrees,
keep ETYFish's wording and tell the user about the disagreement (in the commit message too). Order and
family names are formed from a type genus: say so ("From Lamna: ..."). If ETYFish has no entry, use
Wikipedia, then FishBase, then the original description (Biodiversity Heritage Library), marked "possibly"
where uncertain. WebFetch and curl may be blocked from etyfish.org and Wikipedia in cloud sessions; if so
use WebSearch with `allowed_domains: ["etyfish.org"]` (then `["wikipedia.org"]`) and quote what comes back.

Write the findings to a scratch note (scratchpad dir, not the repo) as `claim -> source URL`. If two
sources disagree on a number, use the more authoritative one and say so in the note; if a name or
classification cannot be confirmed, **stop and ask the user** rather than guessing.

Also verify for each missing clade (order/family/genus) a `meaning` (required) plus Latin name, common name, species
count claims in descriptions ("Nine species..."). Only state counts you have confirmed.

## 2. Taxonomy
Reuse existing files in `content/clades/` when the clade is already there. For each missing clade create
`content/clades/<id>.json` (id = lowercase Latin name; rank `order|family|genus`; `parent` = id one rank
up, `null` for an order). Fields: `id, rank, parent, latin, common, meaning, description` (+ optional
`order` sort key, `companions`). Descriptions are one or two plain sentences. If adding a species makes
an existing clade description false (e.g. "Eight of the nine hammerheads...", counts, "only species"),
update that description in the same commit.

## 3. Species content
Create `content/species/<id>.json` where `<id>` is the Latin name, lowercase, dashed, matching the file
name. Copy the shape of `content/species/sphyrna-mokarran.json`. Fields: `id, genus, latin, common,
meaning, description, lengthM, depth, eats, wikipedia, model, representative, swim, distribution`.
- `description`: 2-3 sentences for the screen, specific and checkable (what it looks like, one behaviour
  or fact). No superlatives you have not verified.
- `model`: snake_case base name matching `pipeline/species/<model>.json` (e.g. `tiger_shark`).
- `representative`: `true` only if it should be the pick for its clade; leave it off otherwise.
- `swim`: slow filter feeders small numbers, fast hunters larger; amplitude typically 0.10-0.17.
- `companions`: omit unless the derived ones would be wrong.
- `distribution`: polygons as `[lon, lat]` rings; keep them coarse and check they match the verified range.

## 4. Model
Follow the **shark-model** skill (`.claude/skills/shark-model/SKILL.md`) in full: copy the closest
`pipeline/species/*.json`, set `length_m`, build the body from your appearance notes, iterate with
`--fast`, then the final render. Look at the PNGs (silhouettes first, then hero, then head) and compare
against reference photos (shark-model skill, "Compare against reference photos"); fix anything that does not
identify the species or that is off in proportion. If photos cannot be fetched, say so in the report and commit message. Then:
```bash
cd pipeline && ../.venv/bin/python -I make.py <model>     # exits 0, all PASS lines
cd .. && npm run models <model>                           # writes public/models/<model>.glb
```
Add the species to the list in `pipeline/README.md` (name, length, what is distinctive about it).

## 5. Verify
1. `npm run content` passes (catches duplicate ids, missing parents, wrong ranks, missing model).
2. `npm run typecheck && npm test` pass. `tests/core.test.ts` ("shows every drawable species when they fit") hardcodes the shipped species
   ids sorted by length, shortest first; add the new species there in the right place, in the same commit.
3. Re-read every file you wrote and **re-verify online each name and fact in it**, as a separate pass
   from step 1: Latin name spelling and authority, common name, every etymology, family/genus/order
   placement, length, depth, diet, range polygon vs. a range map, Wikipedia slug resolves. Fetch the
   sources again rather than trusting your notes; fix any mismatch. Also check clade descriptions you
   touched. Record the final `fact -> source` list for the commit message.
4. Optionally `npm run dev` and open `#<species-id>` to see it, or the `run` skill.
If a check fails, fix it before committing. Never commit a failing or unverified shark.

## 6. Commit (atomic, one shark)
Stage only this shark's files by explicit path (never `git add -A`):
- `content/species/<id>.json`, any new/changed `content/clades/*.json`, `tests/core.test.ts`
- `pipeline/species/<model>.json`, `pipeline/README.md`
- `models/<model>.glb`, `public/models/<model>.glb`, `renders/<model>_*.png` (never the reference photos or comparison sheets)
- any pipeline code changed *specifically* for this shark (if the change is general, make it a separate
  earlier commit).
```bash
git status --short                      # nothing unrelated staged; public/data is gitignored
git commit -m "Add <common name> (<Latin name>)" -m "<summary + verified sources>"
```
Message body: what was added (clades, species, model), the sources used to verify name/classification/
etymology/length, and any known weakness of the model or any value you could not confirm. End with
the attribution lines the session specifies. Then `git push -u origin <branch>` (retry on network error
only). After the commit, `git status` must be clean before starting the next shark.

## 7. Report
Per shark: commit hash, what was verified and from where, anything uncertain, and the hero + head
renders (send them to the user). State model weaknesses plainly.
