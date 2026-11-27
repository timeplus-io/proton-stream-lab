# Proton Stream Lab

Animated explainers of how [Timeplus Proton](https://github.com/timeplus-io/proton) processes streams, built with D3.js.
Each episode is one self-contained HTML page: a stream that keeps running until you press Pause, with a few tabs that change the query.

| # | Episode | Tabs |
|---|---|---|
| 01 | [Stateless transform](dist/01-transform.html) | pass through, filter, convert, filter + convert |
| 02 | [Streaming aggregation](dist/02-aggregation.html) | global aggregation with EMIT PERIODIC and EMIT ON UPDATE, tumble window, late events, WITH DELAY |
| 03 | [Streaming join](dist/03-join.html) | stream JOIN table, stream JOIN stream (bidirectional), range join with date_diff_within, LATEST JOIN |

Planned, following the Proton KT order: changelog, backfill, S3 storage, hybrid hash table, materialized views, checkpoint, cluster.

Hosted previews (private claude.ai artifacts): [01](https://claude.ai/artifact/5NnepDP1ZoGJvyrUWehrin) · [02](https://claude.ai/artifact/JMaGU5PCMeF28HHKdS6vQL) · [03](https://claude.ai/artifact/H23UQb72c9wxyJ7e4prsfx). `links.artifacts.json` maps episodes to those URLs for `build.py --fragment --links links.artifacts.json`.

## Stream Stories: the same ideas for readers who are not engineers

A second series tells the same ideas as a small factory, drawn as a hand-made isometric sheet: marker washes with paper tooth, thin ink lines that run past their corners, paper-doll workers and labels in the margins.
It is plain SVG with no libraries. There is no SQL on these pages. The Stream Lab episodes above stay as they are, for engineers.

| In the story | In stream processing |
|---|---|
| the production line, which never stops | a stream |
| one candy on the line: its flavor, the weight a worker reads off the scale and writes on its tag, the time on its stamp | one event: its key, its value, its event time |
| a worker at the line | an operator |
| the clock on the wall | time |
| raw candy in, finished candy or a report card out | input stream, output stream |
| a tally board in chalk at the worker's side | state: what a worker has to remember |
| a recipe sheet that never changes; a note from it stuck on a candy | a table; a joined column |

| # | Story | Scenes | Engineer episode |
|---|---|---|---|
| 01 | [The candy line](dist/story-01-candy-line.html) ([preview](https://claude.ai/artifact/R493f7zWncGesHC1xrh1FQ)) | the line (every candy is weighed and tagged), the inspector (weighs, keeps what is heavier than 30 g), the price (a second worker writes 2¢ a gram), the whole line | 01 Stateless transform |
| 02 | [The tally board](dist/story-02-tally-board.html) ([preview](https://claude.ai/artifact/RVBX5zR6T1nTExjA3uSyLW)) | keep a tally (every 2 seconds a card per flavor), every change, time slots (windows), a late candy, wait a little | 02 Streaming aggregation |
| 03 | [The recipe sheet](dist/story-03-two-lines.html) ([preview](https://claude.ai/artifact/PiEduM87snHWvJE5bB18q7)) | the recipe sheet (stream and table). To come: slips that arrive on a second line and change the sheet (stream and stream, within 5 seconds, latest) | 03 Streaming join |

Rules for a story:

- One room seen from a fixed isometric view. The lines run from the upper left to the lower right, and until Pause.
- A story follows its lab tab by tab: the same data (key, value, time), the same rule, the same output. Only the words and the props change.
- The worker visibly does the work, and moves like a person. The eyes go to the candy before a hand does. One hand reaches out and meets the candy as it arrives, lifts it in front of the belly, and the other hand joins for the work; then one hand sets it down again or tosses it away, and both hands go back to the sides. A thing in a hand goes where the hand goes; nothing flies into a hand. Hands start and stop gently, elbows stay low and close, and the body bends at the hips towards the work.
- A join is a note from the recipe sheet stuck on the candy: the worker finds the row that belongs to the candy and sticks a copy of it on.
- Keep every element clean and clear: nothing in the room that the scene does not use, and nothing overlapping.
- Everything that happens has a cause the reader can see, done by hand and within reach. A candy has no weight until a worker has put it on the scale, read the window and tied on a tag. What a worker has to remember is a slate at the worker's side: the worker sees the candy, then chalks the number up, and wipes a column by hand. A result is a card the same worker writes on the pad at the head of the card line and pushes onto it. A hand does one thing at a time, so jobs wait their turn. Nothing is written, moved or wiped from a distance.
- Margin labels name only what the scene is about. Each scene has one short caption that states the idea in plain words and gives the engineer's word last.

The look follows the tradition of hand-drawn isometric explainer sheets, and April Zhu's Tinycharts was the reference for it. All drawing code in `stories/` is written for this repo; none of the Tinycharts kit is used or included.

## Design rules

- Keep it simple: one stage, input on the left, the operator in the middle, output on the right.
- The canvas holds only three things: data cards, the operator (a frame with its rule), and time (axis, now pointer, clock). No counters, zone labels, badges or icons. Anything said by the tabs, the SQL or the caption is not repeated on the canvas.
- The stream runs until the viewer presses Pause.
- All data sits inside the data card: id, key, value, event time. Output cards use the same format as input cards, one card per record, like the rows of the SQL result.
- Position is time: a card sits on the scrolling time axis at its own timestamp and reaches the operator when the clock shows that time. Arrivals are uneven (bursts and gaps), never evenly spaced.
- Color is the key (the device). Shape is the stream: rounded for the main or left stream, square corners for the right stream of a join, rounded left and square right for a joined record. A legend above the stage says so.
- A remark about a card that is not part of its data goes under the card in the watermark color, for example "4s late" on an event that arrives after its own timestamp.
- The note under the SQL is written for a first-time reader: the idea first, then what to watch, in plain words.
- State is a hollow card that stays inside the operator. In an aggregation there is one per key, each on its own row.
- Motion is never hidden. An input card leaves its input line at the operator's edge, turns onto its key's row, lands on top of the state card and sinks into it; the number that changed lights up. A card that is refused (a late event, a lookup with no match) takes the same path, then turns grey and falls away.
- The output of an aggregation mirrors the input: each record grows out of its key's state card and stays on that key's row, so the output shows one line per key, with every card at its emit time. Records emitted together on one row leave one after another.
- A join has two inputs and they never share a lane: the left stream arrives on the upper lane, the right side on the lower lane, each with a name and its own ids (`t1`, `h1`). A side that is remembered has its own table inside the operator, on its lane, and a stored row is a small chip in that table, one row of chips per key. An input card shrinks into its chip. A side that is not remembered keeps moving on its lane: when its card reaches the operator, the chip it matches lights up, a copy of that chip travels to the card, and the card becomes the joined record. A table does not move at all: its rows are in the operator from the first frame. When both sides are remembered, each joined record grows out from between the two tables while its two chips light up, and the records leave on one line.
- The watermark is the only dashed line: gold, on the time axis. Window boundaries are thin solid lines that scroll with the axis. If the watermark is further back than the stage shows, its label is pinned to the right edge.
- Timeplus styling: Inter, Timeplus pink accent, purple-tinted greys.

## Run it

No build tools are needed to view a page: open `dist/<episode>.html` in a browser (the lab pages load D3 from a public CDN, and all pages load fonts from Google Fonts).

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
stories/src/story.js          shared SVG kit: isometric point, hand-ruled ink, marker wash, boxes, paper dolls, margin labels, scene buttons
stories/src/factory.js        the candy factory every story is set in: room, lines, racks, bins, workers with jointed arms, candies with tags and sticky notes, cards
stories/src/story.css         the paper sheet, hand-lettered labels, page around it (light + dark)
stories/src/story-shell.html  page template for a story
stories/episodes/NN-*/episode.js   one file per story: scenes, what arrives when, what the worker does with it
stories/stories.json          story metadata
dist/               built pages (committed so they can be opened or served directly)
```

An episode gives the runtime `{ modes, init(svg, mode), tick(dt, now), legend }`. `init` draws the stage for a tab, `tick` advances it.

## Accuracy

Rules shown on stage follow the Proton source, for example:

- Tumble watermark = start of the window containing `max event time − delay` (`WatermarkStamper::calculateWatermark`).
- A window is finalized when `window.end <= watermark` (`WindowAggregatingTransform::finalize`).
- Events with `event time < watermark` are dropped as late.
- A global aggregation without an `EMIT` clause emits every 2 seconds.
- `JOIN table(x)` snapshots the right side once when the query starts and builds a static hash table; only left rows produce output.
- `LATEST JOIN` keeps one row per key of the right stream; only left rows produce output.
- A bidirectional join of two append streams buffers both sides and fails with `Streaming join's memory reaches max size` when the buffer limit is hit (`MemoryHashJoin::checkLimits`).
- A range join takes the minimum of the two sides' watermarks (`MemoryHashJoin::calculateWatermark`) and removes rows that fell behind it by more than the range (`BufferedStreamData::removeOldBuckets`). Proton does this per time bucket; the animation does it per row.

Timings, batch sizes and the number of events are simplified for readability.
