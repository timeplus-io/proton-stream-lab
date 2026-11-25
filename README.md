# Proton Stream Lab

Animated, step-through explainers of how [Timeplus Proton](https://github.com/timeplus-io/proton) processes streams, built with D3.js.
Each episode is one self-contained HTML page with chapters you can play, pause and step through.

| # | Episode | Covers |
|---|---|---|
| 01 | [Stateless transform](dist/01-transform.html) | event time vs processing time, filter, expressions, chunks, restarting a stateless materialized view |
| 02 | Streaming aggregation | global aggregation, EMIT PERIODIC / ON UPDATE, tumble and hop windows, watermarks, late events, DELAY, checkpoint and recovery |
| 03 | Streaming join | enrichment vs bidirectional joins, hash table state, range joins, aligned checkpoint barriers |

Planned, following the Proton KT order: changelog, backfill, S3 storage, hybrid hash table, materialized views, checkpoint, cluster.

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
