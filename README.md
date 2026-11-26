# Proton Stream Lab

Animated explainers of how [Timeplus Proton](https://github.com/timeplus-io/proton) processes streams, built with D3.js.
Each episode is one self-contained HTML page: a stream that keeps running until you press Pause, with a few tabs that change the query.

| # | Episode | Tabs |
|---|---|---|
| 01 | [Stateless transform](dist/01-transform.html) | pass through, filter, map, filter + map |
| 02 | [Streaming aggregation](dist/02-aggregation.html) | global aggregation with EMIT PERIODIC and EMIT ON UPDATE, tumble window, late events, WITH DELAY |
| 03 | [Streaming join](dist/03-join.html) | LATEST JOIN, bidirectional JOIN of two append streams, range join with date_diff_within |

Planned, following the Proton KT order: changelog, backfill, S3 storage, hybrid hash table, materialized views, checkpoint, cluster.

Hosted previews (private claude.ai artifacts): [01](https://claude.ai/artifact/5NnepDP1ZoGJvyrUWehrin) · [02](https://claude.ai/artifact/JMaGU5PCMeF28HHKdS6vQL) · [03](https://claude.ai/artifact/H23UQb72c9wxyJ7e4prsfx). `links.artifacts.json` maps episodes to those URLs for `build.py --fragment --links links.artifacts.json`.

## Design rules

- Keep it simple: one stage, input on the left, the operator in the middle, output on the right.
- The canvas holds only three things: data cards, the operator (a frame with its rule), and time (axis, now pointer, clock). No counters, zone labels, badges or icons. Anything said by the tabs, the SQL or the caption is not repeated on the canvas.
- The stream runs until the viewer presses Pause.
- All data sits inside the data card: id, key, value, event time. Output cards use the same format as input cards, one card per record, like the rows of the SQL result.
- Position is time: a card sits on the scrolling time axis at its own timestamp and reaches the operator when the clock shows that time. Arrivals are uneven (bursts and gaps), never evenly spaced.
- Color is the key (the device). Shape is the stream: rounded for the main or left stream, square corners for the right stream of a join, rounded left and square right for a joined record. A legend above the stage says so.
- State is a hollow card that stays inside the operator, one per key, each on its own row.
- Motion is never hidden. An input card leaves its input line at the operator's edge, turns onto its key's row, lands on top of the state card and sinks into it; the number that changed lights up. A card that is refused (a late event, a lookup with no match) takes the same path, then turns grey and falls away.
- The output mirrors the input: each record grows out of its key's state card and stays on that key's row, so the output shows one line per key, with every card at its emit time. Records emitted together on one row leave one after another.
- The watermark is the only dashed line: gold, on the time axis. Window boundaries are thin solid lines that scroll with the axis. If the watermark is further back than the stage shows, its label is pinned to the right edge.
- Timeplus styling: Inter, Timeplus pink accent, purple-tinted greys.

## Run it

No build tools are needed to view a page: open `dist/<episode>.html` in a browser (it loads D3 and fonts from public CDNs).

To rebuild after editing sources:

```sh
python3 build.py            # full HTML pages -> dist/
python3 build.py --fragment # body-only pages -> build/artifact/ (for hosts that add their own <html> wrapper)
```

## Layout

```
src/lab.js          shared runtime: data card, state card, tabs, legend, Pause, the simulation loop
src/lab.css         shared tokens and styles (light + dark)
src/lab-shell.html  page template (title, tabs, legend, stage, SQL, caption)
episodes/NN-*/episode.js   one file per episode: tabs, event generator, operator logic, rendering
episodes.json       episode metadata
dist/               built pages (committed so they can be opened or served directly)
```

An episode gives the runtime `{ modes, init(svg, mode), tick(dt, now), legend }`. `init` draws the stage for a tab, `tick` advances it.

## Accuracy

Rules shown on stage follow the Proton source, for example:

- Tumble watermark = start of the window containing `max event time − delay` (`WatermarkStamper::calculateWatermark`).
- A window is finalized when `window.end <= watermark` (`WindowAggregatingTransform::finalize`).
- Events with `event time < watermark` are dropped as late.
- A global aggregation without an `EMIT` clause emits every 2 seconds.
- `LATEST JOIN` keeps one row per key of the right stream; only left rows produce output.
- A bidirectional join of two append streams buffers both sides and fails with `Streaming join's memory reaches max size` when the buffer limit is hit (`MemoryHashJoin::checkLimits`).
- A range join takes the minimum of the two sides' watermarks (`MemoryHashJoin::calculateWatermark`) and removes rows that fell behind it by more than the range (`BufferedStreamData::removeOldBuckets`). Proton does this per time bucket; the animation does it per row.

Timings, batch sizes and the number of events are simplified for readability.
