# Add Editorial to myportfolio

I have an editorial portfolio at `myportfolio/`. Each editorial is a standalone HTML page in `myportfolio/editorials/`, its media lives in `myportfolio/editorials/images/<slug>/`, and `myportfolio/index.html` lists it in a JS array called `projects`. I export pages from Salesforce Commerce Cloud (SFCC), so a new page arrives as a raw fragment with SFCC image paths. Help me prepare it using the steps below.

---

## What I will give you

- The editorial HTML file name, e.g. `design-philosophy-danielle-turnlock.html`
- The image folder I dropped into `editorials/images/`, e.g. `demi-turnlock`
- Optional: a display title, whether it is `featured`, and any rename I want

If I don't give a title, infer one from the page's main heading and confirm it in your summary.

---

## Folder structure

```
myportfolio/
├── index.html                       ← projects array (portfolio registry)
└── editorials/
    ├── a-html-standard-structure.html   ← page skeleton template
    ├── <slug>.html                      ← one page per editorial
    └── images/
        ├── <slug>/                      ← media for that editorial
        └── media-assets/                ← shared icons (play, pause, mute…)
```

---

## Step 1 — Naming

- The **slug** is the HTML file name without `.html`, in kebab-case.
- The image folder name should match the editorial's subject. If I ask for a rename (e.g. `demi-turnlock` → `danielle-turnlock`), rename the **folder and every file inside it** that contains the old name.
- Media file pattern already in use: `<prefix>_01.webp`, `<prefix>_02.mp4`…, with a `-mobile` variant for mobile assets, e.g. `<prefix>-mobile_01.mp4`.
- Don't rename files I didn't ask about.

---

## Step 2 — Link the images

SFCC exports use paths like:

```
images/curated-by-the-house/design-philosophy/demi-turnlock/design-philosophy-demi-turnlock_01.mp4?$staticlink$
```

Rewrite each one to the local folder, relative to the HTML file:

```
images/<folder>/<file>?$staticlink$
```

Rules:
- **Keep the `?$staticlink$` suffix.** Every editorial in this folder keeps it.
- Shared icons point to `images/media-assets/`. Files available there: `play-white.svg`, `pause-white.svg`, `play-black.svg`, `pause-black.svg`, `mute.png`, `unmute.png`, `mute.webp`, `unmute.webp`, `mute-black.png`, `unmute-black.png`, `pd20-cursor-final.gif`.
- Check every place a path can appear: `src`, `srcset`, `<source>`, `poster`, inline `style="background-image:url(...)"`, and JS slide arrays (e.g. `createSplideSliderCarousel({ slides: [...] })`).
- **Leave SFCC placeholders alone:** `$url('Product-Show', ...)$`, `$url('Search-Show', ...)$`, `data-pid`, `data-collection-popup-url`. They are intentional.

---

## Step 3 — Apply the standard structure

Wrap the page using `editorials/a-html-standard-structure.html`. The finished file looks like this:

```html
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<!-- Stylesheets -->
...existing <link> tags from the export...

<!-- Scripts -->
...existing <script src> tags from the export (jQuery first)...

<!-- BootStrap -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"></script>

<style>
...existing <style> content...
</style>
</head>

<body>

...page markup...

...existing inline <script> blocks, in their original order...

</body>

</html>
```

Rules:
- If the page loads jQuery, put Bootstrap **after** it, because Bootstrap 4's JS needs jQuery. If there is no jQuery, Bootstrap can go straight after the meta tags.
- Don't add a Bootstrap link or script that is already there.
- Bootstrap makes text near-black (`#212529`) and links blue, darker blue on hover. Each editorial is standalone with no shared stylesheet, so the page has to override these itself. Add whichever of these rules the page's `<style>` doesn't already have, at the top:
  ```css
  /* Base text colour (Bootstrap defaults to #212529) */
  body {
      color: black;
  }

  /* Override Bootstrap's blue links: follow the surrounding text colour */
  a,
  a:hover {
      color: inherit;
  }
  ```
- Move the code as it is. Don't restyle it, reformat it or change its logic.

---

## Step 4 — Register in `myportfolio/index.html`

Append a new object to the **end** of the `projects` array (newest last):

```js
{
  title: "Design Philosophy - Danielle Turnlock",
  file: "editorials/design-philosophy-danielle-turnlock.html",
  live: "",
  features: [
    { label: "Video", type: "media" },
    { label: "Custom Video Controls", type: "interaction" },
    { label: "Splide", type: "interaction" },
    { label: "Dropdown", type: "interaction" },
    { label: "Art Direction", type: "story" }
  ]
},
```

- `title`: Title Case. Use the series pattern if one exists (`Design Philosophy - <Name>`, `Versatility in One - III`).
- `live`: `""` unless I give a live URL.
- `featured: true` (on the line after `title`): add it only if I ask. It puts the editorial in the default "Featured Works" view.
- `features`: 3–5 entries, worked out from what the page actually uses. `type` must be one of `media` | `interaction` | `layout` | `story`.

### Feature labels already in use (reuse these)

| type | labels |
|---|---|
| `media` | `Video` · `Vimeo Video` · `Scroll Video` · `Video Sequence` · `Mixed Media` · `Multimedia` · `Responsive Images` |
| `interaction` | `Splide` · `Swiper` · `Dropdown` · `Nested Dropdowns` · `Hover` · `Hover Composition` · `Scroll Animation` · `Scroll Stack` · `Vertical Slider` · `Slider Build` · `Custom Video Controls` · `Cursor Follower` |
| `layout` | `Editorial Layout` · `Campaign Layout` · `Responsive Layout` · `Narrative Layout` · `Desktop-Mobile Variants` · `Mobile Adaptation` · `Responsive Sections` · `Layout System` |
| `story` | `Art Direction` · `Product Story` · `Campaign Story` · `Editorial Story` · `Brand Story` · `Interview Format` · `Storytelling` |

How to read the code:
- `new Splide(` → `Splide`. `new Swiper(` → `Swiper`.
- `<video>` → `Video`. A Vimeo `<iframe>` or `player.js` → `Vimeo Video`.
- `.controls` / `.progressBar` / `.seek` → `Custom Video Controls`.
- `toggleDropdown` / `.dropdown1` → `Dropdown`.
- Separate `d-md-none` / `d-none d-md-block` blocks → `Desktop-Mobile Variants` or `Responsive Layout`.
- Design-philosophy or product deep-dive pages → `Art Direction` or `Product Story`.

---

## Step 5 — Verify

Run these checks and include the results in your reply:

1. Every `images/...` path in the HTML resolves to a file on disk. List any that are **missing**.
2. List any files in the image folder that the HTML **never references** (unused assets).
3. No old SFCC folder paths remain (e.g. `curated-by-the-house`).
4. The page has exactly one `<!DOCTYPE html>`, `<head>`, `</head>`, `<body>`, `</body>` and `</html>`, in that order.
5. The new `projects` entry is valid JS: commas and braces are correct, and the array still closes with `];`.

---

## Step 6 — Flag leftovers (don't fix unless I ask)

Exports are often copied from an older editorial. Point out:
- `alt` text, headings or comments naming a **different** product or campaign (e.g. `alt="Jatte Vibe"` on a Danielle page)
- Anchors or category IDs from another editorial (e.g. `pwjattebag-anchor`)
- The "Published on" date, so I can confirm it
- Obvious markup typos, e.g. a stray quote in `<video autoplay muted loop playsinline">`

---

## Don't

- Commit, push or stage anything.
- Edit other editorials, the template file or the shared `media-assets/` folder.
- Convert, compress or delete image or video files.
- Remove `?$staticlink$` or the `$url(...)$` placeholders.

---

## Reply format

End with a short summary:
- Files and folders renamed (old → new)
- Number of paths rewritten
- Structure added (yes/no, and anything moved)
- The `projects` entry you added
- Verification results (missing / unused / leftover SFCC paths)
- Leftovers flagged for me to review
