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

I will paste the HTML snippet code. Read it and generate the correct entry line ready to paste into the array.

From the code, determine:
- **`file`** — suggest a layout-pattern filename in PascalCase (see naming convention above) and confirm the category folder
- **`name`** — human-readable version of the filename; describe the layout pattern, not the content
- **`platform`** — infer from the layout type and whether it has responsive/mobile handling
- **`tags`** — pick from the tag reference above; include `"image"` if the snippet features images
- **`layout`** — short label from the layout label table above
- **`mobile`** — look for `@media` queries or mobile-specific logic to determine mobile behaviour
- **`desc`** — one sentence describing what it renders and any key behaviour

If the snippet code is unclear or could be categorised multiple ways, ask one clarifying question before generating the entry.
