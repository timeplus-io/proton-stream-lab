# Proton Stream Lab

Animated, step-through explainers of how [Timeplus Proton](https://github.com/timeplus-io/proton) processes streams, built with D3.js.
Each episode is one self-contained HTML page with chapters you can play, pause and step through.

| # | Episode | Covers |
|---|---|---|
| 01 | [Stateless transform](dist/01-transform.html) | event time vs processing time, filter, expressions, chunks, restarting a stateless materialized view |
| 02 | [Streaming aggregation](dist/02-aggregation.html) | state, global aggregation with EMIT PERIODIC and ON UPDATE, tumble windows, watermark, late events, WITH DELAY |
| 03 | [Streaming join](dist/03-join.html) | enrichment vs bidirectional joins, hash table state, range joins, aligned checkpoint barriers |

Planned, following the Proton KT order: changelog, backfill, S3 storage, hybrid hash table, materialized views, checkpoint, cluster.

Hosted previews (private claude.ai artifacts): [01](https://claude.ai/artifact/5NnepDP1ZoGJvyrUWehrin) · [02](https://claude.ai/artifact/JMaGU5PCMeF28HHKdS6vQL) · [03](https://claude.ai/artifact/H23UQb72c9wxyJ7e4prsfx). `links.artifacts.json` maps episodes to those URLs for `build.py --fragment --links links.artifacts.json`.

## Design rules (agreed on episode 01)

- Keep it simple: one stage, input on the left, the operator in the middle, output on the right.
- The canvas holds only three things: data cards, the operator (a frame with its rule), and time (axis, now pointer, clock). No counters, zone labels, badges or icons. Anything said by the tabs, the SQL or the caption is not repeated on the canvas.
- The stream runs until the viewer presses Pause.
- All data sits inside the data card: id, key, value, event time. Output cards use the same format as input cards.
- Position is time: a card sits on the scrolling time axis at its own timestamp and reaches the operator when the clock shows that time. Arrivals are uneven (bursts and gaps), never evenly spaced.
- A legend under the stage explains what color means (here: the device).
- Timeplus styling: Inter, Timeplus pink accent, purple-tinted greys.

- State is a hollow card that stays inside the operator. Events are routed to their key's row and absorbed.
- The output is one stream: one card per record, all in one line, like the rows of the SQL result. Records emitted at the same moment (a periodic emit, a closed window) leave the operator one after another.
- The watermark is the only dashed line: gold, on the time axis. Window boundaries are thin solid lines that scroll with the axis. If the watermark is further back than the stage shows, its label is pinned to the right edge.

Episodes 01 and 02 use the simple runtime (`src/lab.js`, `src/lab.css`, `src/lab-shell.html`). Episode 03 still uses the first, chapter-based runtime (`src/core.*`, `src/shell.html`) until it is rebuilt.

## Run it

No build tools are needed to view a page: open `dist/<episode>.html` in a browser (it loads D3 and fonts from public CDNs).

To rebuild after editing sources:

```sh
python3 build.py            # full HTML pages -> dist/
python3 build.py --fragment # body-only pages -> build/artifact/ (for hosts that add their own <html> wrapper)
```

## Layout

```
src/core.css      shared tokens and styles (light + dark)
src/core.js       shared runtime: step runner, blocks, tape, output grid, chapter UI
src/shell.html    page template (header, stage, controls, legend, series nav)
episodes/NN-*/episode.js   one file per episode: chapters, scripts, animation
episodes.json     episode metadata
docs/visual-language.md    the shared visual vocabulary
dist/             built pages (committed so they can be opened or served directly)
```

## Accuracy

Rules shown on stage follow the Proton source, for example:

- Tumble/hop watermark = start of the window containing `max event time − delay` (`WatermarkStamper::calculateWatermark`).
- A window is finalized when `window.end <= watermark` (`WindowAggregatingTransform::finalize`).
- Events with `event time < watermark` are dropped as late and counted in the `Found N late events` log.
- Checkpoints are barrier based and aligned for multi-input operators (`src/Checkpoint/`).

Timings, batch sizes and the number of events are simplified for readability.
