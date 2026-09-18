# CitCat

A data-driven visual content engine. Design animated, interactive content on a timeline, connect it to a database, and render HTML5 pages or product videos at scale.

<!-- Screenshot: add a screenshot of the editor here -->

## What it does

CitCat is a desktop app that combines a visual timeline editor (inspired by SWiSH and CapCut) with database-driven templating. You place objects on a canvas, animate them with keyframes and effects, wire up interactive buttons and navigation — then connect a product database and batch-render one output per row. No code required.

The output is self-contained HTML5 (Canvas + JS) that runs in any browser.

## Features

- **Canvas editor** — text, shapes, images, videos, buttons, hotspots on a stage
- **Timeline** — keyframe animation with easing (linear, ease-in/out/in-out)
- **Effects library** — 15 built-in effects (fade, slide, scale, typewriter, bounce, spin, pulse, float)
- **Motion paths** — draw bezier curves, objects follow them during playback
- **Scenes** — multiple scenes with transitions (crossfade, wipe, slide)
- **Interactivity** — event/action system: click → go to scene, toggle visibility, set properties
- **Video objects** — embed video clips with trim and mute controls
- **Database binding** — connect SQLite or CSV, bind object properties to columns
- **Batch export** — one HTML5 page per database row
- **HTML5 export** — single file or folder, autoplay/loop options
- **Undo/redo** — full command history (Ctrl+Z / Ctrl+Shift+Z)
- **Templates** — save and load project templates
- **Demo project** — loads on startup showcasing all features

## Getting started

Prerequisites: [Rust](https://rustup.rs) (1.70+), [Node.js](https://nodejs.org) (18+).

```bash
cd citcat
npm install
npm run tauri dev     # development mode
npm run tauri build   # production build
```

## File format

Projects are saved as `.citcat` files — human-readable JSON matching the internal data model.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| T / R / E | Text / Rectangle / Ellipse |
| I / M | Image / Video |
| B / H / P | Button / Hotspot / Motion Path |
| Space | Play / Pause |
| Del | Delete selected |
| Ctrl+S | Save |
| Ctrl+O | Open |
| Ctrl+E | Export |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+D | Duplicate |
| Ctrl+C / V | Copy / Paste |
| Ctrl+0 | Reset zoom |
| G | Toggle grid snap |

## Tech stack

- **Tauri v2** — Rust backend + webview
- **Vanilla JS** — no frontend framework (the editor speaks the same language as the output)
- **HTML5 Canvas** — rendering engine shared between editor and export
- **rusqlite + csv** — database connectors

## License

MIT — Mirjam Block, 2026
