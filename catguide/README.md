# The Feline Index

A single-file HTML reference site for domestic cat breeds and cat care, styled like a natural history collection's specimen catalog. Open `cat-breed-catalog.html` in any browser — there's no build step, no server, and no dependencies beyond three Google Fonts.

## Why this exists

Most "cat care" content online is either a random blog post, a vet clinic's thin marketing page, or a wall of text with no structure. This project is an attempt at something closer to a reference desk: browsable by topic, searchable, honest about what's opinion versus sourced fact, and — since it's built for a Singapore-based owner — grounded in local specifics (HDB rules, real clinics, real prices) rather than generic US-centric advice.

It's also deliberately *not* a business directory pretending to be a blog. Where the site recommends a real vet, groomer, store, cattery, or sitter, that data was checked against the business's own site and independent listings, not invented — and where a claim (like a Google rating) couldn't be independently confirmed, the site says so instead of guessing.

## What's inside

The site has two top-level sections, toggled from the sticky nav bar: **Care Guide** (the default view) and **Breed Index**.

### Care Guide

Ten tabs, in the order a new or prospective owner would actually need them:

| Tab | What it covers |
|---|---|
| **Emergencies** | Signs that mean "go to a vet now," first-aid steps for urinary blockage, breathing trouble, seizures, poisoning, heatstroke, and trauma. Every card carries the same shared list of 4 Singapore 24-hour vet hospitals. |
| **Before You Get a Cat** | Honest pre-adoption questions: the 15–20 year commitment, real costs (upfront and ongoing), HDB/rental legal rules, a lifestyle-fit checklist, and who the actual day-to-day caregiver will be. Includes an interactive readiness gauge (see below). |
| **Adoption** | Adoption vs. buying from a breeder, the adoption process step-by-step, Singapore's PALS licensing and window-meshing legal requirements, and the four main adoption routes (SPCA, Cat Welfare Society, Animal Lovers League, Kitten Sanctuary Singapore). |
| **Life Stages** | What changes for a cat as a kitten, adult, and senior — feeding, vet visit frequency, and the specific health risks that shift by age. |
| **Diet & Nutrition** | Why cats are obligate carnivores, wet vs. dry food tradeoffs, a toxic-foods list, and where to buy food in Singapore. |
| **Allergies & Sensitivities** | The three common allergy types (flea, food, environmental) and how to actually tell them apart at home. |
| **Daily Care** | Feeding/water routine, grooming (with a monthly nose-to-tail self-check), litter box setup, and enrichment/play. |
| **Travel & Boarding** | The sitter-vs-boarding tradeoff (cats are territorial, so in-home sitting is usually gentler), what to check in a cattery, how to brief a sitter or relative, a pre-trip checklist, and real Singapore catteries/sitters. |
| **Health & Safety** | What a vet visit actually covers, two at-home checks (gum color, skin-tent hydration test), and home-proofing hazards including window-mesh installers. |
| **Products & Services** | Real Singapore vets, groomers, and pet stores, grouped by type, with direct "Get directions / Call / Website" actions — no drill-in modal, since these are business listings, not articles. |

Every tab shares one search box (search the current tab, or type anything to search across all of them at once) and cards that expand into a detail modal on click — except Products & Services and the shop listings inside Travel & Boarding, which put their action buttons right on the card front instead, since there's nothing else to "read" once you already have the address and phone number.

### Readiness gauge

The "Before You Get a Cat" tab includes a small interactive quiz: five yes/somewhat/no questions, one per card in that tab, feeding a semicircle gauge with a needle that moves live as you answer. It resolves to one of three plain-language verdicts (good fit / a few things to sort out / might not be the right time) once all five are answered. Nothing is saved anywhere — it resets on reload, in keeping with the rest of the site being read-only reference material rather than something that tracks visitors.

### Breed Index

35 breeds across seven categories. Each breed has a quick-glance card (name, one-line trait, color-coded stamp) that drills into a modal with a fact-chip grid (origin, weight, lifespan, coat, energy level, best-for) plus a longer write-up on the breed's actual history and genetics, and a link to its official TICA breed profile.

| Category | Breeds |
|---|---|
| **Natural** — shaped by climate and geography before deliberate breeding | Maine Coon, Siberian, Norwegian Forest Cat, Turkish Van, Turkish Angora, Egyptian Mau, American Shorthair |
| **Hairless** — coatless by a single genetic mutation | Sphynx, Donskoy, Peterbald |
| **Wild Hybrid** — a few generations removed from a wildcat ancestor | Bengal, Savannah, Chausie, Toyger |
| **Ear & Tail Mutations** — one cartilage/bone difference, standardized | Scottish Fold, American Curl, Kurilian Bobtail, Manx |
| **Long-Haired Classics** — the show-ring aristocrats | Persian, Himalayan, Ragdoll, Birman, Somali |
| **Short-Haired Classics** — the oldest formally recognized lines | British Shorthair, Russian Blue, Abyssinian, Burmese, Siamese, Oriental Shorthair, Cornish Rex, Devon Rex |
| **Rare & Distinctive** — small registries or a very specific look | Munchkin, LaPerm, Khao Manee, Lykoi |

## Design decisions and reasoning

A few choices were deliberate enough to be worth writing down, mostly because they weren't obvious on the first pass and only became clear after the site grew:

**Single static HTML file.** No framework, no bundler, no backend. For a personal reference site that one person edits occasionally, the overhead of a build step buys nothing — a text editor and a browser refresh is the whole workflow.

**Modal drill-in for articles, direct actions for businesses.** Early on, every card opened the same detail modal regardless of what it represented. That worked for advice content but was actively annoying for business listings — clicking into a modal just to see "Get directions" and "Call" for a vet clinic is an unnecessary step when the whole card *is* that business. Products & Services and the shop sections of Travel & Boarding now render those actions directly on the card front instead.

**One shared shop directory, not scattered duplicates.** Real businesses (a vet, a food store) often needed to appear in more than one place — a vet shows up in both Products & Services and the Emergencies tab's shared contact list; a pet store shows up in both Products & Services and a Diet & Nutrition card recommending where to buy food. Rather than retyping the same address and phone number in three places (and having them drift out of sync when one copy gets updated and the others don't), every real business is defined once in a `SHOPS` object and rendered everywhere through the same `shopChip()`/`shopCard()` helpers.

**A gauge instead of another static checklist.** Most of the site is intentionally *not* interactive — it's reference material, read and move on. The readiness quiz is the one exception, because "am I actually ready for this" is a question that benefits from a tally, not just a bulleted list to read past. It's built as a semicircle meter rather than a plain progress bar mostly for visual distinctiveness against the otherwise flat card-catalog look.

**Care Guide is the default view, Emergencies is its first tab.** The site used to open on the Breed Index, which makes sense for someone shopping for a cat but not for an existing owner who landed here because something's wrong. Care Guide now loads first, and within it, Emergencies is the first tab — the one scenario where "how fast can I find this" actually matters.

**Real, verified local data over generic advice.** Every business recommendation, and the HDB/PALS legal claims, were checked against the business's own site or an official government source (AVS) rather than relying on memory. Where independent sources disagreed or a claim couldn't be pinned down (a handful of Google ratings, for instance), the site says so in the business's blurb instead of presenting an unverified number as fact.

**Explicit cross-linking, audited on purpose.** As tabs were added over time, cards started referencing other tabs by name in their prose ("see the Adoption tab for details") without always having an actual clickable link to get there. A deliberate pass was made to trace every such mention against that card's actual links and add the missing ones — the goal being that anything the text tells you to go look at, you can actually tap through to.

## Maintaining this file

Everything lives in `cat-breed-catalog.html` — one `<style>` block, one `<script>` block, no separate files.

- **Breeds** are defined in the `categories` array (grouped by breed type). Each breed object needs `name`, `tag`, `note` (short card-front blurb), and for the modal: `origin`, `weight`, `lifespan`, `coat`, `energy`, `bestFor`, a longer `detail` string, and a `link` to a reference source. An optional `images` array (`[{url, alt, credit, creditUrl}]`) feeds a photo carousel both on the card front (a mini version with its own prev/next/dots once there's more than one photo) and at the top of the breed's modal — omit it and both fall back to the same sketch icon. `credit`/`creditUrl` render as a small clickable source link in the modal's corner; omit them for your own photos, set them when crediting a stock source.
- **Care Guide tabs** are defined in the `careCategories` array, in display order. Each tab has `key` (used for `internal:` jump links), `label`, `code` (short file-index prefix), `title`, `desc`, and `items`.
- **Care items** need `name`, `tag`, `color`, `note`, and usually a `detail` string. Use `\n\n` to separate paragraphs — a block made of consecutive `• ` or `1. ` lines is automatically converted into a real list by `formatDetail()`. Inline `<b>`/`<strong>` tags pass through untouched.
- **Links on a care item** come in three flavors, set via `linksMode`: `"references"` (a plain reading list — external articles or `internal:<tabKey>` jump links), `"entities"` (a thumbnail-grid of businesses, built via `shopChip()`), or omit both and set `linkGroups` instead if an item needs more than one link section at once (see the Emergencies tab or Home-Proofing for examples).
- **Real businesses** go in the `SHOPS` object once, keyed by a short id. Reference them elsewhere with `shopChip('id', overrides)` (a single link chip) or `shopChip('id')` via `shopLinks([...ids])` for a list. `shopCard('id')` builds a full standalone card for a directory-style tab (see `PRODUCT_SHOP_GROUPS` / `TRAVEL_SHOP_GROUPS` for how Products & Services and Travel & Boarding assemble their grouped listings).
- **Internal jump links** use `url:"internal:<tabKey>"` — clicking them switches the active Care Guide tab and scrolls to it. Keep these honest: if a card's text says "see the X tab," it should have a matching link, not just the words.

## Disclaimer

This is a personal reference project, not veterinary advice — the site says so in its own footer, and it's worth repeating here. Business listings are a starting point, not an endorsement; hours, prices, and contact details should be confirmed directly before relying on them.
