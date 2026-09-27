# CitCat Examples

Real-world example projects demonstrating what CitCat can do.

| Example | Use case | Key features shown |
|---|---|---|
| [Product Catalogue](product-catalogue/) | Batch product pages from a database | Data binding (CSV **and** SQLite), all four bind transforms, all seven condition operators, batch export, filters |
| [Interactive Training](interactive-training/) | Workplace safety training with quizzes | Events, quiz buttons, wait points, sequential reveals |
| [Music Video](music-video/) | Lyric/karaoke video with subtitles | Subtitles, motion paths, colour grading, animated filters, video trimming, background images, audio |
| [Presentation](presentation/) | Animated company pitch deck | Multi-scene, wait-for-click, transitions, staggered reveals |

Each folder contains a `.citcat` project, a README, and its supporting data.

## Generated assets

Images, the SQLite database and the video clip are **generated from scripts**
(`_gen_*.py`, `_build.py`) rather than committed as opaque binaries, so they stay
small and anyone can rebuild them. Run the script in a folder to regenerate that
example's assets.

## A note on data binding

Bindings and conditions are resolved by the **exporter**, and separately by the
**editor** for its preview stepper. The browser runtime does not resolve them, so
a raw `.citcat` played in an embed shows the literal `{{placeholder}}` text.
Export the project, or preview it in the editor.
