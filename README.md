# sealpillow.github.io

Personal portfolio site for Brian Lua — IT Business Analyst and frontend developer at Charles & Keith.

**Live site:** https://sealpillow.github.io

---

## Structure

```
/
├── index.html              # Homepage — entry point with nav cards
├── about.html              # About page with progress nav sidebar
├── myportfolio/            # Portfolio gallery
│   ├── index.html          # Project grid with lightbox
│   └── editorials/         # Individual HTML project files
├── mylayouts/              # Layout snippet library
│   ├── index.html          # Searchable snippet viewer
│   ├── ADD_SNIPPET.md      # Guide for adding new snippets
│   └── layouts/snippets/   # HTML snippet files by category
├── stocks/                 # Stock tracker tool
├── brianlua-resume.pdf
└── favicon.svg
```

---

## Adding a portfolio project

Projects are registered in the `projects` array in `myportfolio/index.html`.

```js
{
  title: "Project Name",
  featured: true,             // show in featured filter
  file: "editorials/my-file.html",
  live: "https://...",        // optional — omit or leave "" if no live URL
  features: [
    { label: "Video",   type: "media" },
    { label: "Splide",  type: "interaction" },
    { label: "Hover",   type: "interaction" },
    { label: "Editorial Layout", type: "layout" }
  ]
}
```

**`type` values for feature tags:** `media` · `interaction` · `layout` · `logic` · `story`

Place the HTML file in `myportfolio/editorials/` and add the entry to the array.

---

## Adding a layout snippet

See [`mylayouts/ADD_SNIPPET.md`](mylayouts/ADD_SNIPPET.md) for the full entry format, platform values, tags reference, and instructions for using Claude Web to generate entries automatically from snippet code.

Snippet files live in `mylayouts/layouts/snippets/` organised by category:

```
desktop/    mobile/     web-5050/   web-center/
web-flexi/  web-grid/   web-image/  web-text/
fullwidth/  hover/      sliders/    redirects/   special/
```

---

## Pages

| Page | Description |
|---|---|
| `index.html` | Landing page with nav cards to each section |
| `about.html` | Bio, skills, timeline — with sticky progress nav |
| `myportfolio/` | Dark-theme gallery of editorial and campaign builds |
| `mylayouts/` | Searchable library of reusable HTML layout snippets |
| `stocks/` | Personal stock tracking tool |
