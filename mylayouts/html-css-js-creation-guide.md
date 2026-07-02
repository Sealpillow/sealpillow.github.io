# HTML/CSS/JavaScript — New Component Creation Guide

## Objective

Use this guide to write a prompt that instructs an AI to build a new UI component from scratch.

Unlike the extraction guide (which reverse-engineers existing code), this guide helps you **specify what you want** clearly enough for an AI to produce it correctly the first time.

---

# Step 1 — Determine Complexity

Pick the level that matches what you are building.

---

## Level 1 — Static Layout

No JavaScript. HTML and CSS only. Layout responds to viewport but has no user interaction.

Examples: hero banners, editorial splits, image grids, text sections, fullwidth image/video.

Sections to include:

```
Goal
Dependencies
Layout
Styling
Responsive
Output Requirements
```

---

## Level 2 — Interactive Component

Has JavaScript for a single interactive feature — click, hover, toggle, or animation trigger.

Examples: accordion, tabs, carousel, modal, sticky bar, hover swap, scroll effect.

Sections to include:

```
Goal
Dependencies
Layout
Styling
Behaviour
Responsive
Output Requirements
```

---

## Level 3 — Data-Driven or Complex Component

JavaScript drives rendering from a data array, or multiple scripts run independently, or components synchronise with each other.

Examples: JS-rendered product grid, synced carousels, quiz, multi-instance video player, scroll scrubber.

Sections to include:

```
Goal
Dependencies
Architecture
Layout
Styling
Behaviour
Responsive
Code Quality
Output Requirements
```

---

# Step 2 — Write Each Section

---

## Goal

One paragraph. Describe:

* What the component looks like at a glance
* What content it displays (images, video, text, products)
* What it does (static, interactive, animated)
* Any important constraint or variant (desktop-only, mobile-first, no JS)

Keep it to 2–4 sentences. Do not list individual CSS values here.

If unsure: Describe what you picture visually, even roughly. A loose description is better than nothing — the AI can interpret intent. Example: "A two-column layout with an image on the left and some text on the right. It should stack on mobile. Not sure about the exact proportions yet."

---

## Dependencies

List each external library you want used. One bullet per library. Include the CDN URL if known.

* If no external libraries are needed, write: `* No external dependencies.`
* Specify CSS-only or CSS + JS where it matters (e.g. Bootstrap CSS only, no JS bundle)

Examples:

* Bootstrap 4.6.2 — https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css
* Splide 4.1.4 CSS — https://cdn.jsdelivr.net/npm/@splidejs/splide@4.1.4/dist/css/splide.min.css
* Splide 4.1.4 JS — https://cdn.jsdelivr.net/npm/@splidejs/splide@4.1.4/dist/js/splide.min.js

If unsure: State the feature you need and let the AI choose. Example: "Needs a carousel — use a suitable lightweight library." Or if you want to avoid a library entirely: "Vanilla JS only, no carousel library."

---

## Architecture

Only include this section for Level 3 components.

Describe:

* How the data is structured (e.g. a JS array of objects, each with image URL, title, link)
* What each data object needs to support — describe the capability, not the field name (e.g. "each slide needs separate text colors for desktop and mobile" rather than naming the specific fields)
* How the component is rendered (e.g. a loop that creates DOM elements, a Splide instance initialised after rendering)
* Whether multiple independent scripts are needed and what each one does
* If different data values should produce different HTML (e.g. a video entry renders a `<video>` element, an image entry renders an `<img>`), describe each branch

If unsure: Describe the outcome you want rather than the structure. Example: "Each tile should be driven by a data array so content can be swapped without touching the HTML. The exact object shape is flexible."

---

## Layout

Describe the visual structure. Use one bullet per distinct element or container.

Specify:

* Number of columns, rows, or layers
* Width and height constraints (e.g. full viewport width, 50% each column, max-width 1200px)
* How elements are positioned (flex, grid, absolute overlay, sticky)
* Order and stacking (what sits on top of what)
* Spacing and padding values if they matter visually
* Clickable area — if a card, slide, or panel should be fully clickable (not just an inner link), specify that the entire area is a link

You do not need to name CSS classes — describe the result, not the implementation.

If unsure: Use relative descriptions. Example: "Roughly equal columns", "image takes about two thirds of the width", "text sits centred over the image". For spacing: "generous padding, similar to a standard editorial section."

---

## Styling

Describe the visual appearance. Use one bullet per element or style concern.

Specify:

* Font family, size, weight, line-height, letter-spacing, colour
* Background colours or images
* Border, border-radius, shadow
* Opacity, mix-blend-mode, filter
* Transition or animation properties (duration, easing)
* Hover states
* Image crop — specify `object-position` if the image should show from a specific edge (e.g. `object-position: top` to keep the top of a portrait visible)
* Video attributes — if the component includes video, specify which of these apply: `autoplay`, `muted`, `loop`, `playsinline`

If unsure: Describe the mood or intent rather than exact values. Examples: "a muted dark overlay, roughly 50% opacity", "a subtle fade transition, nothing too fast", "clean sans-serif, no specific font required", "neutral black and white palette." The AI will pick sensible defaults — refine after seeing the first output.

---

## Behaviour

Describe what happens when the user interacts with the component. Use one bullet per interaction or state.

Specify:

* What triggers the behaviour (click, hover, scroll, load, resize)
* What changes (visibility, position, class, style, content)
* Any timing (delay, duration, debounce)
* Edge cases to handle (e.g. what happens if no link is set)
* Hover trigger scope — if hovering a parent element triggers an animation on a child, specify this (e.g. "hovering anywhere on the slide triggers the underline on the text")

If using a library (Splide, GSAP), describe the configuration options you want set.

If unsure: Describe the end result, not the mechanism. Example: "On hover, the image should dim slightly and a label should appear. The exact animation style is flexible — keep it subtle." You can skip timing values entirely and let the AI use sensible defaults.

---

## Responsive

Describe the layout separately for desktop and mobile. You can write at whatever level of detail suits you — both styles below are valid and produce good results.

**Simple format** — describe the visual result in plain language:

```
* Desktop: Two equal columns side by side.
* Mobile: Single column, image above text.
```

**Technical format** — add exact values when you have them:

```
* Desktop: 50/50 split with 24px gap, image fills left column, max-width 1200px centered.
* Mobile: Stack to single column below 768px, image full width above text, 16px side padding.
```

Both are valid. Use the simple format to get started; add exact values only when you need precise control.

Common defaults if unsure:

* Multi-column grid → Desktop: three equal columns. Mobile: single column stack.
* Side-by-side split → Desktop: two equal columns. Mobile: image above text, full width.
* Desktop-only element → Desktop: visible. Mobile: hidden.
* Full-width hero → Desktop and mobile: full width, no layout change needed.

---

## Code Quality

Only include this section for Level 3 components or when you have specific constraints.

Examples of things to specify here:

* All tile data must live in a JavaScript array — no markup in the HTML body
* The render function and the event listener must be separate script blocks
* Do not use inline styles for layout — use CSS classes
* All analytics attributes must use JSON.stringify

If unsure: Omit this section entirely. The AI will apply standard clean-code practices by default.

---

## Output Requirements

Always include this section verbatim at the end of the prompt.

```
### Output Requirements
* Return only the component implementation.
* Do not include <!DOCTYPE html>, <html>, <head>, <body>, or <title>.
* Output content in the following order: dependency CSS imports (<link>), dependency JavaScript imports (<script>), HTML, CSS, JavaScript.
* Place all dependency imports at the beginning of the output.
* Separate the Dependencies, HTML, CSS, and JavaScript sections using clear comments.
* Use semantic HTML where appropriate.
* Write clean, reusable, and modular code.
* Do not use libraries other than those listed in Dependencies.
```

---

# General Tips

## Flexible on implementation

If you do not mind how something is built, say so explicitly. This prevents the AI from guessing incorrectly.

* "Use any approach that achieves a smooth scroll effect."
* "Column widths are flexible — use equal columns or whatever looks balanced."
* "The hover animation style is your choice, keep it subtle."
* "No preference on whether this uses flexbox or grid."

## Placeholder content

Use descriptive placeholder values for content you will swap in later:

* Images: `placeholder-portrait.jpg`, `placeholder-landscape.jpg`
* Videos: `placeholder-video.mp4`
* URLs: `#` or `https://example.com`
* Text: short placeholder copy that matches the intended length (e.g. a two-word title, a one-sentence description)

---

# What to Specify vs What to Leave Out

| Specify | Leave out |
|---|---|
| Visual dimensions and proportions | Exact class names (unless you need them) |
| Exact font values (family, size, weight) | Internal variable names |
| Colour values you know | Code comments or documentation |
| Breakpoint values | Implementation details the AI can decide |
| Library names and versions | Boilerplate you expect to be standard |
| Interaction triggers and outcomes | Obvious defaults (e.g. box-sizing: border-box) |

---

# Checklist Before Submitting

Before sending the prompt to an AI, check:

* Goal describes the component's appearance and purpose clearly
* Dependencies lists all libraries needed (or states none)
* Layout covers every visible zone and its size/position
* Styling covers fonts, colours, and transitions for all key elements
* Behaviour covers every interaction and its outcome
* Responsive covers all breakpoints where the layout changes
* Output Requirements section is present and unchanged
