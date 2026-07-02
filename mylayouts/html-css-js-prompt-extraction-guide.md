# HTML/CSS/JavaScript → Prompt Extraction Guide

## Objective

Analyze the supplied HTML, CSS, and JavaScript, then generate a prompt that can reproduce the component as faithfully as possible.

The goal is **implementation fidelity**, not source-code fidelity.

The generated prompt should allow another AI to recreate a component that behaves and appears as close as possible to the original.

Differences in class names, variable names, function names, code style, or file organization are acceptable as long as the resulting component is visually and functionally equivalent.

---

# Overall Workflow

For every component:

1. Determine its complexity.
2. Analyze the HTML.
3. Analyze the CSS.
4. Analyze the JavaScript.
5. Extract only information that affects the final component.
6. Generate a structured prompt.

Do **not** summarize the code.

Instead, convert it into a reusable specification.

---

# Step 1 — Determine Complexity

Choose one of the following.

---

## Level 1 — Static Layout

Characteristics

* HTML + CSS only
* No JavaScript
* Static content
* Simple responsive layout

Examples

* Hero
* Banner
* Footer
* Split layout
* Card
* CTA section

Use this prompt structure:

```text
Goal

Dependencies

Layout

Styling

Responsive

Output Requirements
```

---

## Level 2 — Interactive Component

Characteristics

* Single interactive feature
* Limited JavaScript
* One major responsibility

Examples

* Accordion
* Tabs
* Modal
* Dropdown
* Carousel
* Slider

Use this prompt structure:

```text
Goal

Dependencies

Architecture

Layout

Styling

Behaviour

Responsive

Output Requirements
```

---

## Level 3 — Complex Component

Characteristics

* Multiple interactive systems
* Dynamic rendering
* State management
* Component synchronization
* Multiple data structures

Examples

* Synced Swipers
* Dashboard
* Product configurator
* Interactive gallery
* Timeline

Use this prompt structure:

```text
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

# Step 2 — Analyze HTML

Extract only meaningful structure.

Describe

* Overall component purpose
* Major sections
* Content hierarchy
* Semantic relationships

Ignore

* Styling wrappers
* Redundant nesting
* Unnecessary divs

Instead of

```html
<div class="left-panel">
```

Describe

> Left panel displaying promotional media.

---

## Interaction Scope

Capture the scope of interactive elements — not just that a link or hover exists, but what area it covers.

* If an `<a>` wraps a large content area (an entire slide, card, or panel), note that the **entire area is clickable**, not just the text within it
* If a hover animation is triggered by an ancestor element rather than the element being animated, name which ancestor triggers it

Example

Instead of

> The discover text has an underline animation on hover.

Write

> Hovering anywhere on the slide link triggers an underline animation on the discover text.

---

# Step 3 — Analyze CSS

Do not copy CSS.

Instead describe the design.

Extract

## Layout

* Grid
* Flex
* Columns
* Rows
* Alignment
* Positioning
* Stacking order (z-index) — when elements overlap, note which sits on top

Example

Instead of

```css
grid-template-columns:50% 50%;
```

Write

> Two equal-width columns.

---

## Visual Design

Extract

* Typography
* Colours
* Borders
* Border radius
* Shadows
* Image behaviour — include `object-fit` and `object-position` when they determine which part of the image is visible
* Spacing

Capture functional HTML attributes on media elements — these affect loading and autoplay behavior:

* Images: `loading="lazy"`
* Video: `autoplay`, `muted`, `loop`, `playsinline`

Keep exact values only when they define the design.

Examples

Keep

* 40% width
* 22px title
* 14px subtitle
* 28×4 pagination bars
* 768px breakpoint

---

## Components

Describe

* Cards
* Buttons
* Pagination
* Overlay
* Navigation
* Forms

---

## Animations

Describe

* Hover effects
* Underlines
* Fade
* Scale
* Keyframes
* Transition timing

---

## Responsive

Extract

* Breakpoints
* Layout changes
* Typography changes
* Spacing changes
* Component visibility

---

# Step 4 — Analyze JavaScript

Describe behaviour rather than implementation.

Extract

## Data

Only if it affects rendering.

Describe what each data object needs to support — the capability, not the field name. Example: instead of listing `desktoptextColor` and `mobiletextColor`, write "each entry can specify different text colors for desktop and mobile."

Example

```text
slides[]

products[]

categories[]
```

---

## Rendering

Describe

* Static
* Dynamic
* Generated from arrays
* Generated from JSON

If rendering uses conditional branches based on data values, capture all branches and what triggers each.

Example

> If a slide entry has `type: "video"`, render a `<video>` element with desktop and mobile sources. Otherwise render an `<img>` element.

---

## Behaviour

Describe

* Events
* Navigation
* State
* Synchronization
* Autoplay
* Filtering
* Searching
* Expanding
* Collapsing

Example

Instead of

```javascript
swiper.slideTo(index)
```

Write

> Changing one slider updates the other.

---

## Initialization Order

For components that render HTML dynamically before initializing a library, capture the order.

Example

> Render all slides into the DOM first, then initialize the Swiper instances. Initializing before rendering produces an empty carousel.

---

## Library Configuration

Preserve important settings.

Example

Swiper

* fade effect
* loop
* autoplay
* pagination
* navigation

These directly affect implementation.

---

# Preserve vs Abstract

## Always Preserve

Anything that changes the final behaviour or appearance.

Examples

* Layout proportions
* Grid structure
* Responsive breakpoints
* Animation duration
* Typography
* Colours
* Component hierarchy
* Library configuration
* Data model
* Dynamic rendering
* Synchronization
* Interactive behaviour

---

## Abstract

Summarize instead of copying.

Examples

Instead of

```css
display:flex;
justify-content:flex-end;
```

Write

> Bottom-align the content.

---

Instead of

```css
margin-left:auto;
```

Write

> Align the image to the right.

---

Instead of

```css
object-fit:cover;
```

Write

> Image fills its container without distortion.

---

Instead of

```javascript
addEventListener(...)
```

Write

> Clicking the button toggles the panel.

---

## Ignore

Do not include unless they affect behaviour.

* Class names
* Variable names
* Function names
* CSS property order
* File organization
* Formatting style
* Coding conventions

---

# Writing the Prompt

The generated prompt should read like a technical specification.

Organize related requirements together.

Never mix styling, behaviour and layout within the same section.

---

# Goal Section

Describe the component in one concise paragraph.

Example

> Create a responsive dual-panel Swiper component where the left panel displays promotional slides while the right panel displays synchronized product layouts.

Do not mention implementation details here.

---

# Dependencies

List external libraries only.

Example

* Bootstrap 4.6.2 CSS
* Swiper 11 CSS + JS

If none are required, state:

> No external dependencies.

---

# Architecture

Only include if required by the complexity level.

Describe

* Data model
* Rendering
* Major containers
* Conditional rendering — if JS branches on a data value to produce different HTML, describe all branches and what triggers each
* Initialization order — if HTML must be rendered before a library is initialized, state the required sequence

Avoid HTML implementation details.

---

# Layout

Describe

* Grid
* Flex
* Columns
* Rows
* Positioning
* Stacking order — which elements sit on top of which when they overlap
* Interactive area — if an anchor wraps a large content area, note that the whole area is clickable

Prefer describing the visual result.

---

# Styling

Describe

* Typography
* Colours
* Images — include `object-position` when it determines the visible crop; include functional media attributes: `loading="lazy"` on images, `autoplay`/`muted`/`loop`/`playsinline` on video
* Cards
* Buttons
* Pagination
* Overlays
* Animations

---

# Behaviour

Describe

* User interaction
* Events
* Rendering
* State
* Synchronization
* Hover trigger scope — specify which element is hovered to trigger the effect, especially when it is an ancestor of the animated element

Do not describe JavaScript syntax.

---

# Responsive

Describe

* Breakpoints
* Layout changes
* Visibility
* Spacing
* Typography

---

# Code Quality

Include only for Level 3 components.

Examples

* Semantic HTML
* Reusable JavaScript
* Modular CSS
* Avoid duplicated code
* Separate concerns

---

# Output Requirements

## Output Mode

Choose the appropriate output mode based on the scope of the generated component.

### Snippet Mode

Use for reusable UI components that are intended to be embedded within an existing page.

* Return only the component implementation.
* Do not include `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`, or `<title>`.
* Output content in the following order:
  1. Dependency CSS imports (`<link>`)
  2. Dependency JavaScript imports (`<script>`)
  3. HTML
  4. CSS
  5. JavaScript
* Place all dependency imports at the beginning of the output.
* Separate the Dependencies, HTML, CSS, and JavaScript sections using clear comments.
* Use semantic HTML where appropriate.
* Write clean, reusable, and modular code.
* Do not use libraries other than those listed in Dependencies.

### Standalone Mode

Use for complete pages or applications that are intended to run independently.

* Return a complete HTML document.
* Include `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`, and `<title>`.
* Place all dependency CSS `<link>` tags and JavaScript `<script>` tags inside the `<head>`.
* Separate HTML, CSS, and JavaScript using clear comments.
* Use semantic HTML where appropriate.
* Write clean, reusable, and modular code.
* Do not use libraries other than those listed in Dependencies.

---

# Prompt Quality Checklist

Before returning the prompt, verify:

✓ The generated component would look nearly identical.

✓ The generated component would behave nearly identically.

✓ Responsive behaviour is preserved.

✓ Animations are preserved.

✓ Library configuration is preserved.

✓ Dynamic rendering is preserved.

✓ Important implementation decisions are preserved.

✓ The prompt is organized into logical sections.

✓ The prompt describes outcomes instead of copying source code.

✓ The prompt is concise while preserving fidelity.

---

# Guiding Principle

The purpose of this guide is **not** to reproduce the original source code.

The purpose is to produce a prompt that enables another AI to recreate a component with the same visual appearance, responsive behaviour, interactions, and overall implementation approach.

When deciding whether to include a detail, ask:

> **If this detail changed, would the generated component behave or look noticeably different?**

* If **yes**, preserve it in the prompt.
* If **no**, summarize or omit it.
