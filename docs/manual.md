# CitCat Manual

## What is CitCat?

CitCat is a visual content engine. You design animated, interactive scenes on a canvas — then connect a database and render hundreds of pages or videos from one template. No coding required.

It comes from the same idea as SWiSH (the Flash-era animation tool) and CapCut (the timeline editor), but outputs modern HTML5 that runs in any browser. The twist: database binding turns it into a content factory.

---

## The editor at a glance

```
┌──────────────────────────────────────────────────────────┐
│  Toolbar                                                  │
│  [Play][Pause][Stop] │ Tools │ [New][Save][Open][Export]  │
├──────────────────────────────────────────┬────────────────┤
│                                          │ Properties     │
│               Canvas                     │ Panel          │
│                                          │                │
├──────────┬───────────────────────────────┴────────────────┤
│ Scenes   │ Timeline                                       │
│ Layers   │                                                │
└──────────┴────────────────────────────────────────────────┘
```

- **Toolbar** — tools, playback, file operations
- **Canvas** — your stage. Place and arrange objects here.
- **Properties panel** — edit the selected object's position, style, events, filters, bindings
- **Timeline** — keyframes, playhead, effects. This is where animation happens.
- **Scenes** — list of scenes (like slides). Click to switch.
- **Layers** — z-order of objects. Drag to reorder, toggle visibility and lock.

All panels are resizable — drag the splitter edges between them.

Everything is also in the macOS menu bar: File, Edit, View, Insert, Scene, Playback.

---

## Objects

Place objects on the canvas with the toolbar or Insert menu.

| Object | Key | What it is |
|--------|-----|------------|
| Text | T | Text block. Supports word wrapping. |
| Rectangle | R | Solid or stroked rectangle with rounded corners. |
| Ellipse | E | Circle or oval. |
| Image | I | PNG, JPG, GIF (animated). File picker opens. |
| Video | M | MP4, WebM, MOV clip. Plays in sync with timeline. |
| Audio | A | MP3, WAV, OGG. Invisible on stage, visible in timeline. |
| SVG | S | Scalable vector graphic. Great for logos and icons. |
| Button | B | Styled rectangle with a label. Comes with a default click event. |
| Hotspot | H | Invisible in export, dashed outline in editor. Clickable area. |

### Working with objects

- **Select** (V) — click to select, drag to move, handles to resize
- **Shift+drag** corner handle — maintain aspect ratio
- **Shift+click** — add to multi-selection
- **Drag empty canvas** — rubber band selection
- **Delete** / **Backspace** — delete selected
- **Ctrl+D** — duplicate
- **Ctrl+C / Ctrl+V** — copy and paste

### Properties

Select an object to see its properties in the right panel:

- **Transform** — x, y, width, height, rotation, opacity
- **Style** — fill, stroke, font, text alignment, border radius
- **Content** — text content or file path
- **Filters** — blur, drop shadow, brightness, contrast, saturation, hue rotation, grayscale, sepia
- **Events** — interactive triggers and actions (see Interactivity)
- **Bindings** — database field bindings (see Data Binding)
- **Z-Order** — bring to front, send to back

---

## Scenes

A project has one or more scenes. Think of them as pages in a presentation, or shots in a video.

- **Add** — click "+ Add" in the scenes panel, or Scene > Add Scene
- **Switch** — click a scene in the list
- **Rename** — double-click the scene name
- **Reorder** — drag scenes up or down
- **Delete** — hover and click the × button
- **Transitions** — right-click a scene to set a transition effect (Crossfade, Wipe, Slide) and duration

Each scene has its own canvas, timeline, and objects. Navigate between scenes with Scene > Next / Previous.

---

## Animation

### Keyframes

A keyframe says: "at this moment in time, this property has this value."

1. Select an object
2. Move the playhead to a time on the timeline
3. Double-click the object's track to add a keyframe
4. Change a property (position, opacity, colour...)
5. Move the playhead to another time, add another keyframe
6. Hit **Play** — CitCat interpolates between them

**Easing** options: Linear (constant speed), Ease In (slow start), Ease Out (slow end), Ease In-Out (slow start and end). Right-click a keyframe to change its easing.

### Effects

Built-in animation presets. Select an object, pick an effect from the FX dropdown in the toolbar:

**Entrance**: Fade In, Slide In (Left/Right/Up/Down), Scale Up, Typewriter
**Exit**: Fade Out, Slide Out (Left/Right), Scale Down
**Emphasis**: Pulse, Bounce
**Motion**: Spin, Float

Effects are just keyframe bundles — once applied, they become regular keyframes you can edit.

**Custom effects**: drop a `.json` file into `effects/custom/` and it appears in the FX dropdown. See the built-in effects for the format.

### Motion paths

Draw a curved path for an object to follow:

1. Select an object
2. Switch to the **Path tool** (P)
3. Click on the canvas to add path points — a bezier curve forms
4. Drag the control handles to shape the curve
5. CitCat automatically adds progress keyframes (0% → 100%)
6. Hit Play — the object follows the curve

Double-click a path point to delete it. Clear the entire path in the Properties panel.

### Object lifespan

By default, objects are visible for the entire scene. To make an object appear or disappear at a specific time:

- In the Properties panel > Lifespan section, set **Appear at** and **Disappear at** (in milliseconds)
- In the editor, objects outside their lifespan are shown dimmed
- During playback and export, they're hidden

---

## Interactivity

Make your content respond to user actions — without code.

### Events

Select an object, open the Events section in Properties, and click "+ Add Event":

**Triggers** (when something happens):
- **Click** — the object is clicked
- **Hover Enter / Leave** — mouse enters or leaves the object
- **Timer** — a delay in milliseconds after the scene starts
- **Scene End** — the scene's timeline reaches the end

**Actions** (what to do):
- **Go to Scene** — navigate to another scene
- **Toggle Visible** — show or hide an object
- **Set Property** — change an object's property value

Example: "When the 'Next' button is clicked → Go to Scene 2"

### Wait points

Pause the timeline until a condition is met:

- Double-click the timeline ruler to add a **wait point** (orange marker)
- Configure the resume condition:
  - **Click** — wait for a specific object to be clicked
  - **Any Click** — wait for any click on the stage
  - **Timer** — auto-resume after a delay
  - **Click or Timer** — whichever happens first

Wait points work in both the editor and exported HTML5.

---

## Data binding

Connect to a database and bind object properties to data columns. This is CitCat's power feature.

### Connect

1. Click the **Data** button in the toolbar (or Playback > Data Source)
2. Choose a source type: SQLite, CSV, or PostgreSQL
3. Enter the file path or connection string
4. Click Connect
5. Pick a table — the data browser shows columns and rows

### Bind

1. Select an object on the canvas
2. In Properties > Bindings, click "+ Bind"
3. Choose which property to bind (content, fill colour, etc.)
4. Choose which database column to bind it to
5. Optional: add a transform (uppercase, currency format, image path prefix)

### Preview

Use the row stepper in the data panel (◀ row 3 of 200 ▶) to preview different rows. The canvas updates live — you see exactly what each exported page will look like.

### Conditional visibility

In Properties > Condition, set a rule: "Show this object only when column X equals Y." Objects that fail the condition are hidden for that row's export.

### Batch export

1. Open Export (Ctrl+E)
2. Check "Export all rows"
3. Choose an output folder
4. Optionally pick a column to name files by
5. Click Export

CitCat renders one HTML5 page per database row. 200 products → 200 pages.

---

## Export

### HTML5

**Single file** — one `.html` file with everything embedded (JS, images as base64). Just open it in a browser.

**Folder** — `index.html` + `runtime.js` + `project.json` + `assets/`. Smaller, better for large projects with many images or videos.

Options:
- **Autoplay** — start playing immediately when opened
- **Loop** — restart from Scene 1 when finished

### MP4 Video

Renders each frame to PNG and stitches them with ffmpeg. Requires ffmpeg installed on your system.

Resolution presets: 720p, 1080p, 4K.

Note: interactive elements (buttons, events) are visible but not functional in video — it's a recording of the animation.

### Batch

When a data source is connected, batch export produces one output per database row. Available for both HTML5 and MP4.

---

## Subtitles

Import SRT or VTT subtitle files, or create entries manually.

- **Import** — Subtitles button in toolbar, then Import SRT or Import VTT
- **Export** — Export as SRT or VTT
- **Edit** — click entries on the subtitle track in the timeline

Subtitles are burned into the Canvas during playback and export — white text on a dark bar at the bottom of the stage.

---

## Templates

Save your project as a reusable template:

- **Save** — Templates button > Save as Template (enter a name)
- **Load** — Templates button > pick from the list

Templates strip data bindings and personal content. The demo showcase is a built-in template.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| V | Select tool |
| T | Text tool |
| R | Rectangle tool |
| E | Ellipse tool |
| I | Image tool |
| B | Button tool |
| H | Hotspot tool |
| P | Motion Path tool |
| M | Video tool |
| A | Audio tool |
| S | SVG tool |
| G | Toggle grid snap |
| Space | Play / Pause |
| Del / Backspace | Delete selected |
| Ctrl+N | New project |
| Ctrl+O | Open project |
| Ctrl+S | Save |
| Ctrl+E | Export |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy / Paste |
| Ctrl+0 | Reset zoom |
| F5 | Fullscreen preview |
| Shift+drag handle | Keep aspect ratio |
| Shift+click | Add to multi-selection |
| Middle-click drag | Pan canvas |
| Ctrl+scroll | Zoom canvas |

---

## CLI

CitCat includes a command-line interface for scripting and automation.

```bash
# Create a new project
citcat-cli new "My Project" --output project.citcat

# Get project info
citcat-cli info project.citcat

# Add objects
citcat-cli add-scene project.citcat --name "Intro" --duration 5000
citcat-cli add-object project.citcat --scene 0 --type text --content "Hello" --x 100 --y 100

# Bind data
citcat-cli bind project.citcat --scene 0 --object 0 --property content --column product_name

# Export
citcat-cli export html project.citcat ./output/ --single-file --autoplay

# Batch export from database
citcat-cli batch project.citcat ./pages/ --db products.sqlite --name-column slug
```

---

## MCP Server (for AI agents)

CitCat runs as an MCP tool server, letting AI agents create and export projects programmatically.

```bash
# Start the MCP server (reads JSON-RPC from stdin)
citcat-mcp
```

18 tools available: `project_new`, `project_open`, `project_save`, `scene_add`, `object_add`, `keyframe_add`, `event_add`, `effect_apply`, `data_connect`, `data_bind`, `export_html`, `export_batch`, and more.

An agent can build a complete animated product showcase, bind it to a database, and export 200 pages — without any human touching the GUI.

---

## File format

CitCat projects are saved as `.citcat` files — plain JSON. Human-readable, version-controllable, diffable. The format matches the internal data model exactly.

---

## Effect plugin format

Create a JSON file in `effects/custom/`:

```json
{
  "id": "my-wobble",
  "name": "Wobble",
  "category": "Emphasis",
  "duration_ms": 1000,
  "applies_to": ["Text", "Rect", "Ellipse", "Image"],
  "keyframes": [
    { "time_ms": 0, "property": "transform.rotation", "value": { "Number": 0 }, "easing": "Linear" },
    { "time_ms": 250, "property": "transform.rotation", "value": { "Number": 10 }, "easing": "EaseInOut" },
    { "time_ms": 750, "property": "transform.rotation", "value": { "Number": -10 }, "easing": "EaseInOut" },
    { "time_ms": 1000, "property": "transform.rotation", "value": { "Number": 0 }, "easing": "EaseInOut" }
  ]
}
```

Effects are automatically picked up when the FX dropdown opens.
