# Visual language

Every episode uses the same stage vocabulary so a reader who learned one episode can read the next.

## Time

| Element | Meaning |
|---|---|
| Source tape (left) | Events that have not arrived yet, spaced by **arrival (processing) time**. The `now` line is the reader. |
| Clock (stage and control bar) | **Processing time**: when Proton handles something. |
| Tag under a block (`12s`) | **Event time** (`_tp_time`): when the event happened. |
| Event-time axis (inside window operators) | Where windows live. Windows are placed by event time, never by arrival. |
| Gold dashed line `WM` | **Watermark**: event time up to which input is considered complete. Shaded area left of it is closed. |

## Events and results

| Element | Meaning |
|---|---|
| Color | Key (device, group-by key, join key). Keys A–D map to `--k-a` … `--k-d`. |
| Shape | Which stream: circle = main / left input, square = right input of a join. |
| Number in the block | Event id (stable across operators, re-reads and recovery). |
| Small text above a block | A value column (for example a temperature). Turns accent-colored when an expression changes it. |
| Grey block | Dropped: filtered out or late. |
| Dashed ring around a block | Re-read from the source after recovery. |
| Pill in the output area | An emitted row, with the processing time it was emitted. A dashed pill marked `again` is a duplicate caused by replay. |

## Operators, state, checkpoints

| Element | Meaning |
|---|---|
| Box with title and monospace subtitle | An operator from `EXPLAIN PIPELINE`, with the SQL fragment it implements. |
| Blocks parked inside an operator | That operator's **state** (hash table rows, window buckets). Stateless operators never hold blocks between steps. |
| Dashed frame around several blocks | A chunk (batch) travelling together. |
| Blue flag `ckpt n` | A checkpoint barrier. Injected at the source, saved by each stateful operator as it passes, committed at the sink. |
| Checkpoint storage box | What the last committed checkpoint holds: source sequence number (sn), watermark, operator state. |
| Red flash | A crash: in-memory state and watermark are lost. |

## Page structure

1. Header: series eyebrow, episode title, one-paragraph lede.
2. Chapter rail: each chapter is one concept, with its own scripted stream so the moment that matters is guaranteed to happen.
3. Stage: SVG built with d3, driven by a step runner (Play / Step / Restart / speed).
4. Under the stage: explanation, "What to watch", the SQL, pointers into the Proton source, and a live event log stamped with processing time.
5. Legend and series navigation (same on every page).

## Adding an episode

1. Add an entry to `episodes.json`.
2. Create `episodes/NN-name/episode.js` exporting `{ id, chapters, setup(ch), handle(item) }` to `SL.app()`.
   - `setup` draws the stage for a chapter and returns the queue of timeline items (sorted by processing time `at`).
   - `handle` animates one item. Await every animation through `SL.W(...)` / `SL.sleep(...)` so Restart can cancel it.
3. Reuse `SL.Tape`, `SL.block`, `SL.OutGrid`, `SL.barrier`, `SL.wmTag` rather than drawing new shapes.
4. `python3 build.py` and open `dist/NN-name.html`.
