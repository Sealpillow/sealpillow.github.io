# The Feline Index

A small toolkit of static HTML pages for domestic cat breeds and cat care, styled like a natural history collection's specimen catalog. Open `cat-breed-catalog.html` in any browser — there's no build step, no server, and no dependencies beyond three Google Fonts. Four smaller companion pages branch off it for specific jobs (a printable emergency sheet, a readiness gauge, a trivia quiz, a routine-care checklist) and link back to it.

## Why this exists

Most "cat care" content online is either a random blog post, a vet clinic's thin marketing page, or a wall of text with no structure. This project is an attempt at something closer to a reference desk: browsable by topic, searchable, honest about what's opinion versus sourced fact, and — since it's built for a Singapore-based owner — grounded in local specifics (HDB rules, real clinics, real prices) rather than generic US-centric advice.

It's also deliberately *not* a business directory pretending to be a blog. Where the site recommends a real vet, groomer, store, cattery, or sitter, that data was checked against the business's own site and independent listings, not invented — and where a claim (like a Google rating) couldn't be independently confirmed, the site says so instead of guessing. See `breed-data-sources.md` for the citation trail behind the breed data specifically.

## What's inside

The sticky nav now also carries a small Bengal mascot logo at the top left, so there is no separate hero/banner block to maintain on the main page anymore.

`cat-breed-catalog.html` is the main file. It has two top-level sections, toggled from the sticky nav bar: **Care Guide** (the default view) and **Breed Index** — plus a shared search box that searches whichever one is active.

### Care Guide

65 items across 11 tabs, in the order a new or prospective owner would actually need them:

| Tab | Items | What it covers |
|---|---|---|
| **Emergencies** | 10 | Signs that mean "go to a vet now," a pre-vet checklist, and first-aid notes for urinary blockage, breathing trouble, seizures, poisoning, heatstroke, and trauma. One card is an interactive decision tree ("My Cat Won't Eat"); the rest carry a static severity badge and the shared list of 4 Singapore 24-hour vet hospitals. |
| **Monitor or Vet?** | 4 | The in-between cases that aren't obviously an emergency but aren't nothing either — vomiting/diarrhea, respiratory symptoms, limping, small wounds. Every card here is a branching question tree (see below), not just a static write-up. |
| **Before You Get a Cat** | 5 | The 15–20 year commitment, real costs (upfront and ongoing), HDB/rental legal rules, a lifestyle-fit checklist, and who the actual day-to-day caregiver will be. |
| **Adoption** | 5 | Adoption vs. buying from a breeder, the adoption process step-by-step, Singapore's PALS licensing and window-meshing legal requirements, the four main adoption routes (SPCA, Cat Welfare Society, Animal Lovers League, Kitten Sanctuary Singapore), and settling a cat in on day one. |
| **Life Stages** | 3 | What changes for a cat as a kitten, adult, and senior — feeding, vet visit frequency, body-condition checks, and the specific health risks that shift by age. The kitten card includes an age-by-age socialization timeline. |
| **Diet & Nutrition** | 4 | Why cats are obligate carnivores, wet vs. dry food tradeoffs, a toxic-foods list, and where to buy food in Singapore. |
| **Allergies** | 3 | The three common allergy types (flea, food, environmental) and how to actually tell them apart at home. |
| **Daily Care** | 4 | Feeding/water routine, grooming (with a monthly nose-to-tail self-check), litter box setup (the n+1 rule), and enrichment/play. |
| **Travel & Boarding** | 11 | Sitter-vs-boarding tradeoffs, what to check in a cattery, briefing a sitter, a pre-trip checklist, plus grouped real listings: 4 catteries and 3 in-home sitters. |
| **Health & Safety** | 3 | What a vet visit actually covers, at-home checks (gum color, skin-tent hydration test), home-proofing hazards, and a consolidated "common mistakes" card. |
| **Products & Services** | 13 | Real Singapore vets, groomers, and pet stores, grouped by type (2 general clinics, 4 emergency clinics, 3 groomers, 4 food/supply stores), with direct "Get directions / Call / Website" actions on the card — no drill-in modal, since these are business listings, not articles. |

Every tab shares one search box (search the current tab, or type anything to search across all 65 items at once) and cards that expand into a detail modal on click — except Products & Services and the shop listings inside Travel & Boarding, which render their actions directly on the card front instead, since there's nothing else to "read" once you already have the address and phone number.

**Interactive decision trees.** Five cards total (the 4 in Monitor or Vet?, plus Emergencies' "My Cat Won't Eat") replace the usual static write-up with a branching question tree: answer one question at a time, and a Back button lets you revise an earlier answer without restarting. Every path ends in a color-coded outcome — clay/red for emergency, brass/gold for a vet visit, forest/green for monitor-at-home — the same three-tier language used by the static severity badges elsewhere. Note that a card's badge (visible before you open it) reflects the *typical* case, not a guarantee: answering "Vomiting or Diarrhea" with "repeated, with blood" reaches the emergency outcome even though the card itself shows a "Vet Visit" badge.

**Checklists.** Any card whose detail text is a block of `☐` lines renders as real tickable checkboxes with a live "N of M checked" counter (e.g. "Before Leaving for the Vet," "What It Actually Costs"). Nothing is saved between page loads.

### Breed Index

35 breeds across seven categories. Each breed has a quick-glance card (name, one-line trait, color-coded stamp, mini photo carousel) that drills into a modal built from several stacked panels: a 6-item fact-chip grid (origin, weight, lifespan, coat, energy, best-for), lifestyle badges, an "Ideal For / Key Caution" decision panel, personality + grooming star ratings, the main write-up (three breeds also get an age-by-age development timeline), a color-coded health-risk panel with genetic concerns and screening notes, a 4-row ownership-cost breakdown, a "You May Also Like" related-breeds list, and further-reading links. The decision panel is hand-written for 9 breeds and auto-generated from the other structured fields for the remaining 26 — both look identical to the reader.

| Category | Breeds |
|---|---|
| **Natural** — shaped by climate and geography before deliberate breeding | Maine Coon, Siberian, Norwegian Forest Cat, Turkish Van, Turkish Angora, Egyptian Mau, American Shorthair |
| **Hairless** — coatless by a single genetic mutation | Sphynx, Donskoy, Peterbald |
| **Wild Hybrid** — a few generations removed from a wildcat ancestor | Bengal, Savannah, Chausie, Toyger |
| **Ear & Tail Mutations** — one cartilage/bone difference, standardized | Scottish Fold, American Curl, Kurilian Bobtail, Manx |
| **Long-Haired Classics** — the show-ring aristocrats | Persian, Himalayan, Ragdoll, Birman, Somali |
| **Short-Haired Classics** — the oldest formally recognized lines | British Shorthair, Russian Blue, Abyssinian, Burmese, Siamese, Oriental Shorthair, Cornish Rex, Devon Rex |
| **Rare & Distinctive** — small registries or a very specific look | Munchkin, LaPerm, Khao Manee, Lykoi |

**Filtering.** Five chip groups sit above the grid: Coat, Energy, Size, Lifestyle (Apartment/Family/Beginner/Experienced), and Characteristics (Vocal/Quiet/Affectionate/Independent/Low Shedding). Selecting multiple chips *within* a group is OR logic ("Long or Short"); active selections *across* groups combine with AND logic ("Long-haired AND High energy"). Size is derived automatically from each breed's weight range rather than hand-tagged. Filters persist as you switch category tabs and combine with the search box; a "Clear filters" control appears once anything is active.

**Comparing breeds.** There are two separate ways to compare, worth not confusing:
- A **Cards / Compare Table** toggle switches however many breeds are currently showing (any number, unfiltered or filtered) into one sortable table — click a row to open that breed's full modal.
- A **pinned Compare bar** lets you explicitly save up to 4 breeds via a "Save to Compare" button on each card. Once 2+ are pinned, a floating bar appears (Breed Index view only) with a count and a "Compare ↗" button that opens a separate popup modal: a 13-column sortable table (weight, lifespan, 6 personality/grooming star ratings, and 4 tri-state lifestyle checks), with click-and-drag horizontal scrolling since it usually overflows the screen. Unpin from the popup, from the card itself, or clear everyone from the floating bar.

### Shared shop directory

24 real Singapore businesses are defined once in a `SHOPS` object and rendered everywhere through shared `shopChip()`/`shopCard()` helpers — a vet clinic that appears in both Products & Services and the Emergencies tab's contact list, or a pet store recommended in both Products & Services and a Diet & Nutrition card, is one entry, not three copies that can drift out of sync. `PRODUCT_SHOP_GROUPS` (13 shops) and `TRAVEL_SHOP_GROUPS` (7 shops) assemble the two directory-style tabs; 4 more (window-mesh/grille installers) are referenced only inline inside the Health & Safety "Home-Proofing" card rather than in either directory.

## Companion tools

Four standalone pages share the same visual design and a `toolkit-nav` pill bar for cross-linking, and are promoted via contextual callouts inside the relevant Care Guide tab (e.g. the Emergencies tab promotes the printable sheet; Before You Get a Cat promotes the Readiness Check and Knowledge Quiz; Daily Care promotes the Care Planner).

| Page | What it does |
|---|---|
| `cat-emergency-sheet.html` | A one-page printable reference: the 4 Singapore 24-hour vet hospitals, "signs you need a vet now," choking response, CPR basics, poisoning first-aid, dangerous foods, and toxic plants — each backed by an infographic image. Has a print button and print-specific styling. |
| `cat-readiness-check.html` | A live semicircle gauge answering 8 yes/no questions (commitment, budget, HDB/legal, lifestyle, caregiver, home safety, vet access, travel plan), resolving to one of three verdicts. |
| `cat-knowledge-quiz.html` | 20 multiple-choice questions pulled directly from the guide's own content, each with an instant explanation tied back to the source tab. |
| `cat-routine-care-planner.html` | A 29-item tickable checklist across Daily / Weekly / Monthly / 6–12 Months / Senior / Admin & Setup sections, each item linking back to the relevant Care Guide tab. Sections can be toggled on or off. |

None of the four persist anything between page loads — same "read reference material, then move on" philosophy as the main guide.

## Business & listing enquiries

Real businesses are named throughout the site (Products & Services, Travel & Boarding, and inline elsewhere). A business that wants a correction, removal, or addition — or anyone with another business-related enquiry — can reach out via `luatan68@hotmail.com`, which appears both in the main footer and as a callout on the Products & Services tab.

## Design decisions and reasoning

A few choices were deliberate enough to be worth writing down, mostly because they weren't obvious on the first pass and only became clear after the site grew:

**Static HTML files, no build step.** No framework, no bundler, no backend, across all five pages. For a personal reference site that one person edits occasionally, the overhead of a build step buys nothing — a text editor and a browser refresh is the whole workflow.

**Modal drill-in for articles, direct actions for businesses.** Early on, every card opened the same detail modal regardless of what it represented. That worked for advice content but was actively annoying for business listings — clicking into a modal just to see "Get directions" and "Call" for a vet clinic is an unnecessary step when the whole card *is* that business. Products & Services and the shop sections of Travel & Boarding render those actions directly on the card front instead. The breed and Care Guide modals still share one underlying DOM element rather than being two separate systems, since almost everything about "open, show content, focus-trap, close" is identical between them.

**One shared shop directory, not scattered duplicates.** Real businesses often needed to appear in more than one place. Rather than retyping the same address and phone number in three places (and having them drift out of sync when one copy gets updated and the others don't), every real business is defined once in a `SHOPS` object and rendered everywhere through the same helpers.

**Decision trees for the genuinely ambiguous cases.** A static severity badge works fine for "difficulty breathing" (always urgent) but not for "vomiting" (usually fine, sometimes not). The Monitor or Vet? tab exists specifically for symptoms where the right answer depends on follow-up questions, not a single label — so those cards ask a short branching sequence of questions instead of asserting one answer up front.

**A gauge and a quiz instead of more static checklists.** Most of the site is intentionally *not* interactive — it's reference material, read and move on. The readiness check and knowledge quiz are the exceptions, because "am I actually ready" and "do I actually know this" are questions that benefit from a tally, not just a list to read past. Both eventually grew large enough to move out of the main catalog file into their own standalone pages rather than staying embedded — keeping the main file focused on being a catalog, not also a quiz engine.

**A pinned Compare tool for actual breed-shopping.** Reading 35 detail modals one at a time doesn't answer "which of these three should I actually get" — the Compare bar exists so a shortlist can be judged side by side on the same axes instead of from memory.

**Care Guide is the default view, Emergencies is its first tab.** The site used to open on the Breed Index, which makes sense for someone shopping for a cat but not for an existing owner who landed here because something's wrong. Care Guide loads first, and within it, Emergencies is the first tab — the one scenario where "how fast can I find this" actually matters.

**Real, verified local data over generic advice.** Every business recommendation, and the HDB/PALS legal claims, were checked against the business's own site or an official government source (AVS) rather than relying on memory. Breed-specific facts (health risks, personality traits, historical timelines) went through several dedicated cross-checking passes documented in `breed-data-sources.md` — where independent sources disagreed or a claim couldn't be pinned down, the site says so in the blurb instead of presenting an unverified number as fact.

**Explicit cross-linking, audited on purpose.** As tabs were added over time, cards started referencing other tabs by name in their prose ("see the Adoption tab for details") without always having an actual clickable link to get there. A deliberate pass was made to trace every such mention against that card's actual links and add the missing ones — the goal being that anything the text tells you to go look at, you can actually tap through to.

## Maintaining this file

To make hand-editing easier, `cat-breed-catalog.html` now includes a few deliberate inline comments marking the parts most likely to be changed manually:
- the sticky header / mascot logo area
- the shared search row
- the Care Guide and Breed Index view shells
- the main script data sources: `categories`, `SHOPS`, and `careCategories`

Everything for the main catalog lives in `cat-breed-catalog.html` — one `<style>` block, one `<script>` block, no separate files. The four companion pages each duplicate the same core CSS variables and font imports rather than sharing a stylesheet — a palette or font change needs to be applied in all five files, not just one.

- **Breeds** are defined in the `categories` array (grouped by breed type). Beyond the original fields (`name`, `tag`, `note`, `origin`, `weight`, `lifespan`, `coat`, `energy`, `bestFor`, `detail`, `images`, `link`), each breed also carries: `links` (an array, not just one — TICA plus a second cross-check source), `personality` (six 1–5 scores), `sources` (citations for personality/health, shown as "Sourced from" footnotes in the modal), `lifestyleBadges`, `groomingDifficulty`/`shedding`, `health` (`concerns`, `geneticRisk`, `screeningNote`), `relatedBreeds`, `cost` (four 1–5 scores), and two optional fields: `decisionGuide` (hand-written "Ideal For"/"Key Caution" text — omit it and the modal synthesizes both from the other fields automatically) and `timeline` (an array of age-labeled milestones, rendered under the write-up when present). Filtering and the Compare tool read these same fields automatically — there's no separate list to keep in sync when adding a breed.
- **Care Guide tabs** are defined in the `careCategories` array, in display order. Each tab has `key` (used for `internal:` jump links), `label`, `code`, `title`, `desc`, and `items` (or `groups` for the two directory-style tabs).
- **Care items** need `name`, `tag`, `color`, `note`, and usually a `detail` string (use `\n\n` to separate paragraphs; a block of consecutive `☐ ` lines becomes a live checklist; a block of `• `/`1. ` lines becomes a real list — all via `formatDetail()`). A `severity` field ("monitor"/"vet"/"emergency") adds the color-coded badge. A `tree` object (`{start, nodes:{...}}` of question/outcome nodes) replaces `detail` entirely with an interactive decision tree instead — see the Monitor or Vet? tab for the pattern.
- **Links on a care item** come in three flavors, set via `linksMode`: `"references"` (a plain reading list — external articles or `internal:<tabKey>` jump links), `"entities"` (a thumbnail-grid of businesses, built via `shopChip()`), or omit both and set `linkGroups` instead if an item needs more than one link section at once.
- **Real businesses** go in the `SHOPS` object once, keyed by a short id. Reference them elsewhere with `shopChip('id', overrides)` (a single link chip) or via `shopLinks([...ids])` for a list. `shopCard('id')` builds a full standalone card for a directory-style tab (see `PRODUCT_SHOP_GROUPS`/`TRAVEL_SHOP_GROUPS`).
- **Internal jump links** use `url:"internal:<tabKey>"` — clicking them switches the active Care Guide tab, clears any search term, closes the open modal, and scrolls back to the guide. Keep these honest: if a card's text says "see the X tab," it should have a matching link, not just the words.

- **Header mascot/logo** lives at `images/brand/bengal-mascot-logo.png`. The markup for it is near the top of the `<body>`, inside the sticky `quickjump` nav.
- **Shared search UI** lives in the `global-search-row` block near the top of the page. The input, clear button, placeholder swapping, and per-view search behavior are all kept in `cat-breed-catalog.html`.

## Disclaimer

This is a personal reference project, not veterinary advice — the site says so in its own footer, and it's worth repeating here. Business listings are a starting point, not an endorsement; hours, prices, and contact details should be confirmed directly before relying on them. Business owners with a correction or removal request can reach out via the contact email in the footer.
