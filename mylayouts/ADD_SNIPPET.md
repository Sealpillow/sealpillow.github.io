# Add Snippet to mylayouts/index.html

I have a snippet library at `mylayouts/index.html`. It contains a JS array called `layouts` where each entry registers an HTML snippet file for display. Help me add new entries using the rules below.

---

## Entry format

```js
{ file:"category/FileName.html", name:"Human-readable name", platform:"web", tags:["tag1","tag2"], layout:"Layout Label", mobile:"Mobile note", desc:"One sentence description." },
```

---

## `platform` values

| Value | Use when |
|---|---|
| `web` | General responsive layouts (50/50, grid, image, text, flexi, center) |
| `desktop` | Desktop-only, no mobile adaptation |
| `mobile` | Mobile-native only |
| `fullwidth` | Full-width hero / video / banner (100vw) |
| `hover` | Layouts driven by hover interaction |
| `sliders` | Carousel / slider components (Splide, Swiper, scroll-scrub) |
| `redirects` | Tab navigation, redirect-between-page patterns |
| `special` | Standalone components — banners, timers, quizzes, utilities |

---

## `tags` reference

**Layout structure:** `5050` `3-col` `4-col` `2-col` `multi-col` `grid` `flexi` `stacked` `asymmetric` `centered` `collage`

**Content type:** `text` `video` `product` `editorial` `slider` `banner` `embed` `overlay` `numbered`

**Interaction:** `hover` `scroll` `sticky` `interactive` `link` `tabs` `navigation`

**Misc:** `quiz` `table` `timeline` `timer`

---

## `layout` label

Short 1–3 word badge shown on the card. Examples:
`"50/50 Split"` `"Three Column"` `"Full Width"` `"Splide"` `"Hover"` `"Sticky"` `"Banner"` `"Quiz"` `"Accordion"` `"Collage Grid"`

---

## `mobile` note

One short phrase. Common values:
`"Mobile stack"` `"Mobile slider"` `"Full width"` `"Desktop only"` `"50/50"` `"Narrow"` `"Half stack"` `"--"`

---

## Section comments in the array (for placement)

Insert new entries under the matching comment block:

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
// SLIDERS
// REDIRECTS
// SPECIAL
```

---

## What I need from you

I will paste the HTML snippet code. Read it and generate the correct entry line ready to paste into the array.

From the code, determine:
- **`file`** — I will tell you the filename and category folder (e.g. `special/MyComponent.html`)
- **`name`** — derive from what the layout actually does visually (not just the filename). Look at the HTML structure, class names, and content to understand the layout pattern
- **`platform`** — infer from the layout type and whether it has responsive/mobile handling
- **`tags`** — pick from the tag reference above based on what the snippet contains
- **`layout`** — short label describing the pattern type
- **`mobile`** — look for `@media` queries or mobile-specific logic to determine mobile behaviour
- **`desc`** — one sentence describing what it renders and any key behaviour

If the snippet code is unclear or could be categorised multiple ways, ask one clarifying question before generating the entry.
