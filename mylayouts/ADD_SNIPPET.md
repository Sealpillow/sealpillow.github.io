# Add Snippet to mylayouts/index.html

I have a snippet library at `mylayouts/index.html`. It contains a JS array called `layouts` where each entry registers an HTML snippet file for display. Help me add new entries using the rules below.

---

## Entry format

```js
{ file:"category/FileName.html", name:"Human-readable name", platform:"web", tags:["tag1","tag2"], layout:"Layout Label", mobile:"Mobile note", desc:"One sentence description." },
```

---

## `platform` values

| Value | Viewer section | Use when |
|---|---|---|
| `web` | Web | General responsive layouts (50/50, grid, image, text, flexi, center) |
| `desktop` | Desktop | Desktop-only, no mobile adaptation |
| `mobile` | Mobile | Mobile-native only |
| `fullwidth` | Full Width | Full-width hero / video / banner (100vw) |
| `hover` | Hover | Layouts driven by hover interaction |
| `sliders` | Carousels | Carousel / slider components (Splide, Swiper) |
| `redirects` | Redirects | Tab navigation, redirect-between-page patterns |
| `special` | Special | Standalone components — banners, scroll effects, timers, quizzes, utilities |

---

## `tags` reference

**Layout structure:** `5050` `3-col` `4-col` `2-col` `multi-col` `grid` `flexi` `stacked` `asymmetric` `centered` `collage` `numbered`

**Content type:** `image` `video` `text` `product` `editorial` `slider` `banner` `embed` `overlay`

**Interaction:** `hover` `scroll` `sticky` `interactive` `link` `tabs` `navigation`

**Misc:** `quiz` `table` `timeline`

### When to add `"image"`
Add `"image"` to any snippet that primarily features images (not pure video or text-only). Omit it from:
- Pure video snippets (already have `"video"`)
- Text-only / editorial text snippets
- Pure interactive components (quiz, timer, accordion)

---

## `layout` label

Short 1–3 word badge shown on the card. Use an existing value where it fits:

| Layout | Used by |
|---|---|
| `"50/50 Split"` | All 50/50 splits |
| `"Flexi"` / `"Flexi 60/40"` / `"Flexi 2:1"` / `"Flexi 1:2"` | Flexi layouts |
| `"Collage Grid"` / `"Custom Grid"` / `"Multi Grid"` | Grid layouts |
| `"Three Column"` / `"Four Column"` / `"Multi Column"` | Column grids |
| `"Grid 3-Col"` / `"Split Grid Carousel"` / `"Product Grid"` | Specialised grids |
| `"Asymmetric Split"` / `"Top Down"` / `"Single Image"` / `"Staggered"` | Web image |
| `"Centered"` | Web center |
| `"Text Split"` / `"Pull Quote"` / `"Info Bar"` / `"Editorial"` | Web text |
| `"Editorial 2-Col"` / `"Editorial Nav"` / `"Section Header"` | Editorial |
| `"Full Width"` | Fullwidth |
| `"Hover"` / `"50/50 Hover"` | Hover |
| `"Carousel"` / `"Carousel Banner"` / `"Auto-Scroll Carousel"` | Carousels (`platform:"sliders"`) |
| `"Scroll Effect"` / `"Sticky"` / `"Ticker"` | Scroll / sticky special |
| `"Banner"` / `"Embed"` / `"Quiz"` / `"Table"` / `"Timeline"` | Other special |
| `"Timer"` / `"Swatch"` / `"Accordion"` / `"Navigation"` / `"Hover Reveal"` | Interactive special |
| `"Section Nav"` / `"Tab"` / `"Redirect"` | Redirects |
| `"Flexi 2 Column"` / `"Offset Portrait"` / `"Two Image Pair"` | Desktop-only |
| `"Numbered List"` / `"Full Width Stack"` / `"Three Image Stack"` | Mobile-only |

---

## `mobile` note

One short phrase. Common values:
`"Mobile stack"` `"Mobile slider"` `"Full width"` `"Desktop only"` `"50/50"` `"Narrow"` `"Half stack"` `"Carousel on mobile"` `"2 items visible"` `"Responsive images"` `"--"`

---

## Section comments in the array (for placement)

Insert new entries anywhere under the matching comment block — the viewer sorts entries alphabetically by name within each section automatically:

```
// DESKTOP
// MOBILE
// WEB 50/50
// WEB CENTER
// WEB FLEXI
// WEB GRID
// WEB IMAGE
// WEB TEXT
// FULL WIDTH
// HOVER
// SLIDERS       ← platform:"sliders", shown as "Carousels" in the viewer
// REDIRECTS
// SPECIAL
```

---

## `essential` flag (optional)

Add `essential:true` if this is a frequently used snippet. It will appear in the **Essentials** view shown on page load.

```js
{ file:"special/MyComponent.html", ..., essential:true }
```

---

## Filename naming convention

Filenames must describe the **layout pattern**, not the content or campaign it was built for.

**Good** — describes structure/behaviour:
`ThreeColEditorialTileGrid.html` `FadeSliderTextOverlay.html` `AsymmetricTwoColArticleLayout.html` `FourColProductGridMobileCarousel.html`

**Avoid** — describes content/campaign:
`CuratedByTheHouseGrid.html` `NewArrivalAutoCarousel.html` `JournalEditorialLayout.html`

Use **PascalCase**. Pattern: `[Prefix][LayoutType][ContentDescription][MobileBehavior][Modifier].html`

### Prefix by folder

| Folder | Prefix | Example |
|---|---|---|
| `desktop/` | `Desktop` | `DesktopSplit5050FullImgLeftProductListRight.html` |
| `mobile/` | `Mobile` | `MobileFullWidthTwoImgStackNumbered.html` |
| `web-5050/` | `Web5050` | `Web5050ImageLeftTextRightMobileStackWithLink.html` |
| `web-center/` | `WebCenter` | `WebCenterTitleDescTextWithLink.html` |
| `web-flexi/` | `WebFlexi` | `WebFlexi6040SliderTextAlternatingMobileStack.html` |
| `web-grid/` | `Web` | `WebThreeColImageTextMobileStack.html` |
| `web-image/` | `Web` | `WebImageLeftLargeRightSmallMobileStack.html` |
| `web-text/` | `Web` | `WebTitleLeftTextRightMobileStack.html` |
| `fullwidth/` | `FullWidth` | `FullWidthImageTextBtmLeftWithRedirectOverlay.html` |
| `hover/` | `Hover` | `HoverTextAppearImageFullScreen.html` |
| `sliders/` | `Carousel` | `CarouselWithPagination.html` |
| `redirects/` | descriptive | `WebMultiPanelSectionNav.html` |
| `special/` | descriptive | `ScrollZoomInOutStatic.html` |

### Common abbreviations in filenames

| Full word | Abbreviation |
|---|---|
| Image | `Img` |
| Bottom | `Btm` |
| Pagination | `Pagin` |
| Description | `Desc` |
| Column | `Col` |
| Mobile Stack | `MobileStack` |
| With Link | `WithLink` |
| No Link | `NoLink` |
| Version | `-v1`, `-v2` |

---

## Display name (`name`) conventions

**Format:** `[LayoutType] [Ratio/Variant] – [Content Description] [(Qualifier)]`

- Use **em dash** `–` as separator for carousels; **hyphen** ` - ` for other sections
- Capitalise main words
- Abbreviate: `Img`, `Btm`, `Col`, `Pagin`, `Desc`
- Include mobile qualifier in parens only to distinguish variants: `(Mobile Stack)`, `(With Link)`, `(v2)`

### Examples by section

| Section | Example names |
|---|---|
| Desktop | `Split 50/50 - Full Img Left, Product List Right` · `Flexi 2-Col Editorial - Img Left, Item Right` |
| Mobile | `Full Width - Two Img Stack, Numbered` · `Split 50/50 - Title Left, Desc Right` |
| Web 50/50 | `50/50 - Img Left, Text Right (with Link)` · `50/50 Image - Mobile Stack, No Link` |
| Web Center | `Center - Image with Text (Mobile Narrow)` · `Center - Title + Desc Text (With Link)` |
| Web Flexi | `Flexi - Large Img Left, Text+Product Right (v1)` · `Flexi 60/40 - Slider+Text Alternating` |
| Web Grid | `Three-Col - Image + Text (Mobile Stack)` · `Collage Grid - Hero Mid, Large + Small Img (v2)` |
| Web Image | `Img Left Large, Right Small - Mobile Stack` · `Single Image - Narrow Desktop, Wide Mobile` |
| Web Text | `Title Left, Text Right - Mobile Stack` · `Editorial Text Opener` |
| Full Width | `Full Width - Image with Text Below` · `Full Width - Video, Text Btm Left + Redirect Overlay` |
| Hover | `Hover - Image Swap` · `Hover - Text Appear, Full Screen Image` |
| Carousels | `Carousel – Auto Scroll Static No Link` · `Carousel – With Pagination` · `Fade Slider – Text Overlay` |
| Redirects | `Multi-Panel Section Nav` · `Inline Tab` |
| Special | `Countdown Timer` · `Accordion / FAQ` · `Scroll Zoom In/Out - Static` |

---

## What I need from you

I will paste the HTML snippet code. Read it and generate **two outputs**:

### 1. layouts array entry

Generate the entry line ready to paste into the `layouts` array in `mylayouts/index.html`.

From the code, determine:
- **`file`** — suggest a layout-pattern filename in PascalCase (see naming convention above) and confirm the category folder
- **`name`** — human-readable version of the filename; describe the layout pattern, not the content
- **`platform`** — infer from the layout type and whether it has responsive/mobile handling
- **`tags`** — pick from the tag reference above; include `"image"` if the snippet features images
- **`layout`** — short label from the layout label table above
- **`mobile`** — look for `@media` queries or mobile-specific logic to determine mobile behaviour
- **`desc`** — one sentence describing what it renders and any key behaviour

### 2. prompts.json entry

Generate the matching prompt entry ready to paste into `mylayouts/layouts/prompts.json`.

- Key must exactly match the `file` value from the array entry above
- Follow the prompt format and section rules defined in the **Adding a prompt entry** section below
- Extract all technical details directly from the snippet code — class names, CSS values, JS function names, CDN URLs, breakpoints
- Use `\n` for newlines in the JSON string value

---

Output both entries in clearly labelled code blocks so they can be copied and pasted separately.

If the snippet code is unclear or could be categorised multiple ways, ask one clarifying question before generating either entry.

---

## Adding a prompt entry

Each snippet has a matching entry in `mylayouts/layouts/prompts.json` keyed by its path relative to the `snippets/` folder (e.g. `"sliders/CarouselWithPagination.html"`).

### Prompt format

```
### Goal
One paragraph describing what the component renders and its key behaviour.

### Dependencies
* CDN name and version — full CDN URL

### Architecture
* How the data is structured and how the component is built (JS-heavy components only)

### Layout
* Structural details — containers, columns, positioning, sizing

### Styling
* CSS properties — fonts, colours, spacing, transitions

### Behaviour
* JS interactions — event listeners, functions, logic

### Responsive
* Breakpoint — what changes at each viewport size

### Code Quality
* Specific constraints or rules the implementation must follow

### Output Requirements
* Return only the component implementation — do not include <!DOCTYPE html>, <html>, <head>, <body>, or <title>
* Output in this order: dependency CSS imports, dependency JavaScript imports, HTML, CSS, JavaScript
* Place all dependency imports at the beginning
* Separate the Dependencies, HTML, CSS, and JavaScript sections using clear comments
* Use semantic HTML where appropriate
* Write clean, reusable, and modular code
* Do not use libraries other than those listed in Dependencies
```

### Section rules

| Section | Include when |
|---|---|
| `### Goal` | Always — one prose paragraph, no bullets |
| `### Dependencies` | Always — use `* No external dependencies.` if none |
| `### Architecture` | Component uses a JS data array to drive rendering, or has multiple distinct script blocks |
| `### Layout` | Always |
| `### Styling` | Always |
| `### Behaviour` | Snippet has JavaScript interaction |
| `### Responsive` | Snippet has `@media` breakpoints or responsive JS logic |
| `### Code Quality` | Component has specific structural constraints worth enforcing |
| `### Output Requirements` | Always — use the exact bullets above, unchanged |

### Writing good bullets

- Be specific: class names, exact CSS values, element types, function names, CDN URLs
- No backtick formatting — plain text only
- One concern per bullet; keep bullets concise
- Goal section is prose only — no bullets
- All other sections (Dependencies, Layout, Styling, etc.) use `* ` bullets exclusively

### JSON format

In the JSON file, use `\n` for newlines within the string value:

```json
"category/FileName.html": "### Goal\nA two-column responsive layout...\n\n### Dependencies\n* Bootstrap 4.6.2 — https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css\n\n### Layout\n* Outer wrapper is a CSS grid with two equal columns.\n* ...\n\n### Styling\n* ...\n\n### Responsive\n* Below 768px: columns stack vertically.\n\n### Output Requirements\n* Return only the component implementation — do not include <!DOCTYPE html>, <html>, <head>, <body>, or <title>\n* Output in this order: dependency CSS imports, dependency JavaScript imports, HTML, CSS, JavaScript\n* Place all dependency imports at the beginning\n* Separate the Dependencies, HTML, CSS, and JavaScript sections using clear comments\n* Use semantic HTML where appropriate\n* Write clean, reusable, and modular code\n* Do not use libraries other than those listed in Dependencies"
```
