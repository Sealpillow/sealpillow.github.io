# sealpillow.github.io

Personal portfolio site for Brian Lua — IT Business Analyst and frontend developer at Charles & Keith.

**Live site:** https://sealpillow.github.io

---

## Structure

```
/
├── index.html              # Homepage — entry point with nav cards
├── about.html              # About page with progress nav sidebar
├── 404.html                # Custom 404 page
├── brianlua-resume.pdf     # Downloadable resume
├── favicon.svg
├── .gitignore
├── myportfolio/            # Portfolio gallery
│   ├── index.html          # Project grid with lightbox and filter
│   └── editorials/         # Individual HTML project pages (~29 files)
│       └── images/         # Local images used by editorial pages
├── mylayouts/              # Layout snippet library
│   ├── index.html          # Searchable snippet viewer
│   ├── ADD_SNIPPET.md      # Guide for adding new snippets
│   └── layouts/
│       ├── media/          # Placeholder images and videos for previewing snippets
│       └── snippets/       # HTML snippet files organised by category (~160 files)
│           ├── desktop/        web-5050/   web-center/
│           ├── mobile/         web-flexi/  web-grid/
│           ├── fullwidth/      web-image/  web-text/
│           ├── hover/          sliders/
│           ├── redirects/      special/
│           └── tobecategorise/ # Staging folder for uncategorised snippets
└── stocks/                 # Personal stock tracking tool
    ├── index.html          # Dividend tracker UI
    └── json/               # Per-ticker dividend cycle analysis JSON files
```

---

## Pages

### `index.html` — Home

Landing page introducing the portfolio with large navigation cards.

- Three nav cards linking to About, Portfolio, and Layouts pages
- Card hover: lift transform, box-shadow, gradient opacity, arrow gap expansion, number badge highlight
- Fade-in on load, fade-out transition on internal link navigation
- SVG noise texture overlay on background
- Custom webkit scrollbar (gold accent)
- Dark theme; fully responsive (3 columns desktop → 1 column mobile at 640px)

---

### `about.html` — About

Professional bio, resume, skills, and contact in a light cream theme.

- **Hero**: 2-column layout — name/tagline left, contact info right
- **Profile**: "Current Focus" and "Approach" blocks
- **Resume**: 2-column grid — sidebar with skills/education, main area with work experience
- **CTA**: Download CV and email buttons
- Fixed left sidebar progress nav (desktop): 4-dot section tracker that updates on scroll
- Bottom horizontal nav bar (mobile): same 4 sections with progress width indicator
- Back-to-top button appears after scrolling 300px
- Smooth scroll on section nav clicks; section detection at 40% viewport threshold

---

### `404.html` — 404

Minimal error page.

- Large low-opacity "404" display text
- Home link with arrow and hover colour transition
- No JS; responsive `clamp()` text sizing

---

### `myportfolio/index.html` — Portfolio

Dark-theme gallery of 32 editorial and campaign projects.

- **Filter bar**: search input (with clear button) + category filter buttons (Media, Layout, Interaction, Story, Logic)
- **View toggle**: Featured vs All Projects
- **Project grid**: 3-column responsive grid, zero-padded card numbering (01, 02…)
- Card hover: veil overlay fades out, blur applies, card lifts (-3px)
- Lazy-loaded iframe previews with shimmer skeleton loader (2× scale rendered down to card size)
- **Lightbox modal**: fullscreen preview with prev/next navigation, position counter, keyboard nav (Escape, arrow keys)
- `projects` array in the file: each entry has `title`, `file`, `live`, `features[]`, `featured` flag
- Feature tag types: `media` · `interaction` · `layout` · `logic` · `story`

---

### `mylayouts/index.html` — Layout Snippet Library

Searchable viewer for ~160 HTML layout snippets.

- **Filter pills**: multi-select with AND logic (all selected filters must match) — Essentials, All, Web, Desktop, Mobile, 50/50, Flexi, Grid, Carousel, Hover, Scroll, etc.
- **Search**: matches filename, display name, layout label, and tags
- **View toggle**: Grid mode (280px min-width cards) and List mode (horizontal single-column)
- **Pagination**: 20 items per page with prev/next and direct page input
- Card hover: iframe preview loads with shimmer, Open button appears
- **Drawer panel** (right-side modal): larger snippet preview, viewport controls (Desktop / Tablet / Mobile), code tabs (CSS / HTML / JS), copy code and copy path buttons
- Viewport controls inject responsive CSS shims (Bootstrap display utilities) so mobile-only snippets render correctly at each size
- Code view parses and splits the raw HTML file into CSS, HTML, and JS tabs; results cached per file
- `layouts` array in the file: each entry has `file`, `name`, `platform`, `tags`, `layout`, `mobile`, `desc`, optional `essential`
- iframe sandboxed with `allow-same-origin allow-scripts allow-popups allow-forms`

See [`mylayouts/ADD_SNIPPET.md`](mylayouts/ADD_SNIPPET.md) for naming conventions, platform/tag reference, and how to add new entries.

---

## Adding a portfolio project

Add an entry to the `projects` array in `myportfolio/index.html`:

```js
{
  title: "Project Name",
  featured: true,             // show in Featured filter
  file: "editorials/my-file.html",
  live: "https://...",        // optional — omit or leave "" if no live URL
  features: [
    { label: "Video",            type: "media" },
    { label: "Splide",           type: "interaction" },
    { label: "Hover",            type: "interaction" },
    { label: "Editorial Layout", type: "layout" }
  ]
}
```

Place the HTML file in `myportfolio/editorials/` and add the entry to the array.

---

## Adding a layout snippet

See [`mylayouts/ADD_SNIPPET.md`](mylayouts/ADD_SNIPPET.md) for the full entry format, platform values, tags reference, naming conventions, and instructions for using Claude to generate entries automatically from snippet code.

Add an entry to the `layouts` array in `mylayouts/index.html`:

```js
{ file:"sliders/CarouselWithPagination.html", name:"Carousel – With Pagination", platform:"sliders", tags:["image","slider"], layout:"Carousel", mobile:"Mobile stack", desc:"Swiper carousel with dot pagination and autoplay." },
```

Drop uncategorised snippets into `mylayouts/layouts/snippets/tobecategorise/` while deciding the right folder.
