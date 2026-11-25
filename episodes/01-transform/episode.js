/* Episode 1: stateless transformation (filter, map, chunks, restart). */
(() => {
  const KEYS = ["A", "B", "C"];
  const G = { tape: { x0: 20, nowX: 300, y: 120, pps: 52 }, opY: 46, opH: 150, opW: 230, outY: 334 };
  let A, L, tape, out, S;

  const c2f = (c) => Math.round((c * 1.8 + 32) * 10) / 10;

  /* Sample stream: device readings. at = arrival (processing) time, et = event time. */
  const BASE = [
    { id: 1, key: "A", et: 1, at: 1.4, val: 24 },
    { id: 2, key: "B", et: 2, at: 2.3, val: 33 },
    { id: 3, key: "C", et: 3, at: 3.6, val: 31 },
    { id: 4, key: "A", et: 2, at: 4.1, val: 35 },
    { id: 5, key: "B", et: 4, at: 4.8, val: 27 },
    { id: 6, key: "C", et: 5, at: 5.6, val: 36 },
    { id: 7, key: "A", et: 6, at: 6.5, val: 32 },
    { id: 8, key: "B", et: 7, at: 7.3, val: 29 },
    { id: 9, key: "C", et: 8, at: 8.1, val: 34 },
    { id: 10, key: "A", et: 9, at: 9.2, val: 38 },
    { id: 11, key: "B", et: 10, at: 10.0, val: 30 },
    { id: 12, key: "C", et: 11, at: 10.9, val: 33 },
  ];
  const withText = (e, unit = "°C") => ({ ...e, valText: `${e.val}${unit}` });

  const OPS = {
    filter: { title: "Filter", sub: "WHERE temperature > 30", test: (e) => e.val > 30 },
    map: { title: "Expression", sub: "temp_f = temperature × 1.8 + 32" },
  };

  const SQL = {
    pass: `SELECT device, temperature, _tp_time\nFROM sensors;   -- runs until you cancel it`,
    filter: `SELECT device, temperature\nFROM sensors\nWHERE temperature > 30;`,
    map: `SELECT device,\n       temperature * 1.8 + 32 AS temp_f\nFROM sensors;`,
    chunk: `SELECT device,\n       temperature * 1.8 + 32 AS temp_f\nFROM sensors\nWHERE temperature > 30;`,
    mv: `CREATE MATERIALIZED VIEW hot_readings_mv\nINTO hot_readings AS\nSELECT device,\n       temperature * 1.8 + 32 AS temp_f\nFROM sensors\nWHERE temperature > 30;`,
  };

  const chapters = [
    {
      id: "events", title: "Events on a stream", short: "Event time vs processing time", sub: "SELECT * on an unbounded stream",
      ops: [], script: BASE, sql: SQL.pass,
      body: [
        "A streaming query never finishes. It sits at the end of the stream and handles each event as it arrives, for as long as the query runs.",
        "Each block is one event. Its color is the device (the key), the number is its id, the value above is the reading, and the tag below is its <b>event time</b>: when the reading was taken. The clock is <b>processing time</b>: when Proton reads the event.",
      ],
      watch: [
        "Blocks on the tape are spaced by arrival time. The \"now\" line is the reader; everything left of it hasn't arrived yet.",
        "Event #4 was taken at 2s but arrives after #3 (3s). Streams are often out of order, and later episodes deal with that.",
        "The gap between an event's tag and the clock when it is read is its delay.",
      ],
      refs: ["Event time lives in <code>_tp_time</code> by default.", "Streaming reads come from NativeLog through the stream source: <code>src/Processors/Sources/</code>."],
    },
    {
      id: "filter", title: "Filter", short: "WHERE drops rows", sub: "Stateless: each event decided on its own",
      ops: ["filter"], script: BASE, sql: SQL.filter,
      body: [
        "A filter checks every event against the WHERE clause. Events that pass go on; events that fail are dropped on the spot.",
        "The filter remembers nothing. The decision for event #7 doesn't depend on anything before it, so the operator has no state to save or restore.",
      ],
      watch: ["Readings of 30°C or less turn grey and fall into the dropped tray.", "Order is kept: survivors leave in the order they arrived."],
      refs: ["Planned as a <code>FilterTransform</code> in <code>EXPLAIN PIPELINE</code>.", "Same code path as batch queries: streaming adds no extra machinery for stateless steps."],
    },
    {
      id: "map", title: "Map and project", short: "Compute new columns", sub: "One row in, one row out",
      ops: ["map"], script: BASE, sql: SQL.map,
      body: [
        "An expression step computes new columns from each event and keeps only the columns you select. Here Celsius becomes Fahrenheit.",
        "Like the filter, it is stateless. One event in, one event out, with the same id and event time.",
      ],
      watch: ["The value above each block changes as it passes the expression box.", "The event time tag is untouched. Changing a value doesn't change when the reading happened."],
      refs: ["Planned as an <code>ExpressionTransform</code>.", "Inside a substream pipeline: <code>ExpressionTransformWithSubstream</code> (<code>src/Processors/Transforms/Streaming/</code>)."],
    },
    {
      id: "chunks", title: "Chunks through a pipeline", short: "Events travel in batches", sub: "Filter and map, chained",
      ops: ["filter", "map"], script: BASE, sql: SQL.chunk, chunked: true,
      body: [
        "Proton doesn't push events one at a time. The source collects what has arrived into a <b>chunk</b> (a small columnar batch) and sends the chunk through the pipeline.",
        "Each operator processes the whole chunk at once. Batching is why throughput is high, and the flush interval is why there is a small extra delay.",
      ],
      watch: ["Events wait in the read buffer until the source flushes a chunk, every 2 seconds here.", "The filter shrinks the chunk; the expression transforms what is left."],
      refs: ["A chunk is <code>DB::Chunk</code> (<code>src/Processors/Chunk.h</code>). Watermarks and checkpoint requests also ride on chunks, as you'll see in later episodes.", "Use <code>EXPLAIN PIPELINE</code> to see the operator chain."],
    },
    {
      id: "restart", title: "Restart a stateless view", short: "Only the source offset is saved", sub: "Materialized view, checkpoint, crash",
      ops: ["filter", "map"], script: BASE, sql: SQL.mv, ckpt: { after: 6, crashAfter: 9 },
      body: [
        "A materialized view runs the query forever and writes results into a target stream. To survive a restart it checkpoints.",
        "A checkpoint barrier enters at the source, which records how far it has read (its sequence number, sn). The filter and expression have no state to save, so the checkpoint is just that offset. After a crash, the view re-reads the source from the saved offset.",
      ],
      watch: [
        "The barrier flows through the operators like an event and they pass it straight on.",
        "Events #7 to #9 were read after the checkpoint, so they are read again after the crash. Their output rows appear a second time (marked <i>again</i>).",
      ],
      refs: [
        "<code>src/Checkpoint/CheckpointCoordinator.cpp</code> schedules checkpoints. With the default interval, a pipeline whose only state is the source offset checkpoints about every 5 s.",
        "Rows written between the checkpoint and the crash can be written again. A target keyed by primary key (a mutable stream) absorbs the repeats.",
      ],
    },
  ];

  function opBox(i, n) {
    const span = 1180 - 360;
    const gap = n === 1 ? 0 : (span - n * G.opW) / (n);
    const x = 360 + i * (G.opW + gap) + (n === 1 ? (span - G.opW) / 2 - 180 : 0);
    return { x, y: G.opY, w: G.opW, h: G.opH, cx: x + G.opW / 2, cy: G.opY + 96 };
  }

  function setup(ch) {
    const svg = d3.select("#stage").attr("viewBox", "0 0 1200 500");
    svg.selectAll("*").remove();
    SL.defs(svg);
    L = {
      bg: svg.append("g"), fx: svg.append("g"), tape: svg.append("g"), blocks: svg.append("g"), out: svg.append("g"), top: svg.append("g"),
    };
    tape = new SL.Tape(L.bg, L.tape, { ...G.tape, label: "Source · sensors stream", sub: "waiting events, spaced by arrival time" });
    S = { clock: 0, ops: ch.ops.map((k, i) => ({ k, ...OPS[k], ...opBox(i, ch.ops.length) })), dropped: [], readSn: 0, buffer: [], ckpt: null, ch, emitted: new Set() };

    // operator boxes
    let prevX = G.tape.nowX + 8;
    S.ops.forEach((op) => {
      SL.flowArrow(L.bg, prevX, G.tape.y, op.x - 6, G.tape.y);
      SL.boxWithTitle(L.bg, { x: op.x, y: op.y, w: op.w, h: op.h, title: op.title, sub: op.sub });
      prevX = op.x + op.w + 6;
      if (op.k === "filter") {
        L.bg.append("rect").attr("class", "box-soft").attr("x", op.x).attr("y", op.y + op.h + 12).attr("width", op.w).attr("height", 80).attr("rx", 8);
        L.bg.append("text").attr("class", "lbl").attr("x", op.x + 10).attr("y", op.y + op.h + 28).text("Dropped by the filter");
      }
    });
    const last = S.ops.length ? S.ops[S.ops.length - 1] : null;
    const outFromX = last ? last.cx : 420;
    SL.flowArrow(L.bg, last ? last.x + last.w + 6 : G.tape.nowX + 8, G.tape.y, last ? 1170 : 1170, G.tape.y);
    L.bg.append("path").attr("class", "flow").attr("d", `M1176,${G.tape.y} L1176,${G.outY - 36}`);
    if (!S.ops.length) {
      L.bg.append("text").attr("class", "muted-txt").attr("x", 700).attr("y", G.tape.y - 14).attr("text-anchor", "middle").text("no operators: every event goes straight to the output");
    }

    // read buffer (chunk mode)
    if (ch.chunked) {
      L.bg.append("rect").attr("class", "box-soft").attr("x", 20).attr("y", 196).attr("width", 280).attr("height", 70).attr("rx", 8);
      L.bg.append("text").attr("class", "lbl").attr("x", 30).attr("y", 214).text("Read buffer: the next chunk");
    }
    // checkpoint store
    if (ch.ckpt) {
      S.ckText = SL.boxWithTitle(L.bg, { x: 20, y: 196, w: 280, h: 96, title: "Checkpoint storage", sub: "nothing saved yet" }).select(".box-sub");
    }

    // output
    L.bg.append("rect").attr("class", "box").attr("x", 20).attr("y", G.outY - 30).attr("width", 1160).attr("height", 186).attr("rx", 10);
    L.bg.append("text").attr("class", "box-title").attr("x", 34).attr("y", G.outY - 8).text(ch.ckpt ? "Target stream · hot_readings" : "Output rows · streamed to the client");
    L.bg.append("text").attr("class", "box-sub").attr("x", 1166).attr("y", G.outY - 8).attr("text-anchor", "end").text("newest last · time = processing time when emitted");
    out = new SL.OutGrid(L.out, { x: 34, y: G.outY + 26, cols: 4, rows: 4, cw: 287, rh: 36, w: 274 });

    // clock text in the stage
    S.clockTxt = L.bg.append("text").attr("class", "clock-big").attr("x", G.tape.nowX).attr("y", G.tape.y - 34).attr("text-anchor", "end").text("00:00.0");

    // events
    const evs = ch.script.map((e, i) => withText({ ...e, sn: i + 1 }));
    evs.forEach((e) => tape.add(e, 0));
    S.evs = evs;
    return buildQueue(ch, evs);
  }

  function buildQueue(ch, evs) {
    const q = [];
    if (ch.chunked) {
      evs.forEach((e) => q.push({ type: "arrive", ev: e, at: e.at }));
      const end = Math.ceil(evs[evs.length - 1].at);
      for (let t = 2; t <= end + 1; t += 2) q.push({ type: "flush", at: t + 0.01 });
      q.sort((a, b) => a.at - b.at);
    } else {
      evs.forEach((e) => q.push({ type: "ev", ev: e, at: e.at }));
      if (ch.ckpt) {
        const a = evs[ch.ckpt.after - 1], b = evs[ch.ckpt.after];
        q.push({ type: "ckpt", at: (a.at + b.at) / 2 });
        const c = evs[ch.ckpt.crashAfter - 1], d = evs[ch.ckpt.crashAfter];
        q.push({ type: "crash", at: (c.at + d.at) / 2 });
        q.sort((x, y) => x.at - y.at);
      }
    }
    return q;
  }

  const setClock = (t) => { S.clock = t; S.clockTxt.text(SL.fmt(t)); };

  async function handle(it) {
    await SL.clockTo({ get clock() { return S.clock; }, setClock: (t) => { setClock(t); A.setClock(t); } }, [tape], it.at);
    if (it.type === "ev") return processChunk([readOne(it.ev)]);
    if (it.type === "arrive") return arriveToBuffer(it.ev);
    if (it.type === "flush") return flush();
    if (it.type === "ckpt") return checkpoint();
    if (it.type === "crash") return crash();
  }

  function readOne(ev) {
    const g = tape.take(ev, L.blocks);
    S.readSn = Math.max(S.readSn, ev.sn);
    return { ev, g };
  }

  async function arriveToBuffer(ev) {
    const it = readOne(ev);
    S.buffer.push(it);
    const i = S.buffer.length - 1;
    A.log(`#${ev.id} arrived, waiting in the read buffer`);
    await SL.W(SL.move(it.g, 44 + i * 30, 244, 380));
  }
  async function flush() {
    if (!S.buffer.length) { A.log("Source flush: buffer empty, nothing to send"); return SL.sleep(150); }
    const items = S.buffer; S.buffer = [];
    A.log(`Source flushes a chunk of ${items.length} event${items.length > 1 ? "s" : ""}: ${items.map((x) => "#" + x.ev.id).join(", ")}`);
    return processChunk(items);
  }

  const slotX = (op, i, n) => op.cx + (i - (n - 1) / 2) * 30;

  async function processChunk(items) {
    let live = items;
    let frame = null;
    const multi = S.ch.chunked;
    for (const op of S.ops) {
      if (!live.length) break;
      // move into the operator
      if (frame) frame.remove();
      if (multi) {
        const n = live.length, w = n * 30 + 14;
        frame = L.fx.append("rect").attr("x", op.cx - w / 2).attr("y", op.cy - 24).attr("width", w).attr("height", 52).attr("rx", 8)
          .style("fill", "none").style("stroke", "var(--muted)").style("stroke-dasharray", "4 3").style("opacity", 0);
      }
      await SL.all(live.map((x, i) => SL.move(x.g, slotX(op, i, live.length), op.cy, 420)));
      if (frame) SL.tr(frame, 200).style("opacity", 1);
      if (op.k === "filter") {
        const keep = [], drop = [];
        live.forEach((x) => (op.test(x.ev) ? keep : drop).push(x));
        if (drop.length) {
          drop.forEach((x) => x.g.classed("dropped", true));
          A.log(`Filter: ${drop.map((x) => `#${x.ev.id} (${x.ev.val}°C)`).join(", ")} fail temperature > 30, dropped`);
          await SL.sleep(250);
          const ps = drop.map((x) => {
            S.dropped.push(x.g);
            const k = S.dropped.length - 1;
            return SL.move(x.g, op.x + 22 + (k % 7) * 30, op.y + op.h + 62, 380);
          });
          await SL.all(ps);
          while (S.dropped.length > 7) SL.fadeOut(S.dropped.shift(), 200);
        }
        if (keep.length) A.log(`Filter: ${keep.map((x) => `#${x.ev.id}`).join(", ")} pass`);
        live = keep;
      } else if (op.k === "map") {
        await SL.sleep(150);
        live.forEach((x) => {
          const f = c2f(x.ev.val);
          x.ev.mapped = `${f}°F`;
          x.g.select(".b-val").text(x.ev.mapped).style("fill", "var(--accent)");
        });
        A.log(`Expression: ${live.map((x) => `#${x.ev.id} ${x.ev.val}°C → ${x.ev.mapped}`).join(", ")}`);
        await SL.sleep(320);
      }
    }
    if (frame) SL.fadeOut(frame, 200);
    if (!live.length) return;
    // emit
    const from = S.ops.length ? { x: S.ops[S.ops.length - 1].cx, y: S.ops[S.ops.length - 1].cy } : { x: 700, y: G.tape.y };
    for (const x of live) {
      const valTxt = x.ev.mapped || `${x.ev.val}°C`;
      const dup = S.emitted.has(x.ev.id);
      S.emitted.add(x.ev.id);
      const p = SL.pos(x.g);
      SL.fadeOut(x.g, 260);
      await out.add({ key: x.ev.key, text: `#${x.ev.id}  ${x.ev.key}  ${valTxt}  · et ${x.ev.et}s`, time: `@${SL.fmt(S.clock)}`, dup, flag: dup ? "again" : null }, p);
    }
    if (!S.ch.chunked && !S.ops.length) A.log(`#${live[0].ev.id} read at ${SL.fmt(S.clock)}, event time ${live[0].ev.et}s → emitted`);
    if (S.ops.length && !S.ch.chunked) A.log(`Emitted ${live.map((x) => "#" + x.ev.id).join(", ")}`);
  }

  async function checkpoint() {
    S.ckN = (S.ckN || 0) + 1;
    const b = SL.barrier(L.top, S.ckN);
    SL.place(b, G.tape.nowX, G.tape.y);
    b.style("opacity", 0); SL.tr(b, 200).style("opacity", 1);
    A.log(`Checkpoint ${S.ckN}: barrier injected at the source. Source has read up to sn ${S.readSn}`);
    S.ckpt = { n: S.ckN, sn: S.readSn };
    await SL.sleep(300);
    for (const op of S.ops) {
      await SL.W(SL.move(b, op.cx, op.cy, 420));
      A.log(`${op.title}: no state, forwards the barrier`);
      await SL.sleep(150);
    }
    await SL.W(SL.move(b, 1176, G.outY - 40, 420));
    S.ckText.text(`ckpt ${S.ckpt.n} ✓ committed`).style("fill", "var(--ok)");
    const g = L.bg.append("g");
    g.append("text").attr("class", "val").attr("x", 34).attr("y", 258).text(`source offset: sn ${S.ckpt.sn}`);
    g.append("text").attr("class", "muted-txt").attr("x", 34).attr("y", 278).text("operator state: none (stateless)");
    A.log(`Checkpoint ${S.ckpt.n} committed: source sn ${S.ckpt.sn}, no operator state`);
    await SL.fadeOut(b, 250);
  }

  async function crash() {
    const flash = L.top.append("rect").attr("class", "crash").attr("x", 330).attr("y", 30).attr("width", 860).attr("height", 250).attr("rx", 10);
    await SL.W(SL.done(SL.tr(flash, 160).style("opacity", 0.18)));
    const t = L.top.append("text").attr("class", "danger-txt").attr("x", 760).attr("y", 268).attr("text-anchor", "middle").text("Crash: the view restarts");
    A.log("Crash. The view restarts and recovers from checkpoint " + S.ckpt.n);
    await SL.sleep(500);
    SL.tr(flash, 300).style("opacity", 0).remove();
    SL.fadeOut(t, 600);
    // rewind: events read after the checkpoint are read again
    const again = S.evs.filter((e) => e.sn > S.ckpt.sn && e.sn <= S.readSn);
    const q = A.runner.queue;
    const step = 0.7;
    const shift = step * (again.length + 1);
    q.forEach((x) => { x.at += shift; if (x.ev) x.ev.at = x.at; });
    const replays = again.map((e, i) => ({ ...e, uid: `${e.id}r`, replay: true, at: S.clock + step * (i + 1), mapped: null }));
    replays.forEach((e) => { S.evs.push(e); });
    // move pending tape events to their new spots, and add replays
    replays.forEach((e) => tape.add(e, S.clock));
    q.unshift(...replays.map((e) => ({ type: "ev", ev: e, at: e.at })));
    S.readSn = S.ckpt.sn;
    A.log(`Source rewinds to sn ${S.ckpt.sn + 1} and re-reads ${again.map((e) => "#" + e.id).join(", ")}`);
    await SL.W(tape.advance(S.clock, 600));
  }

  const ep = { id: "ep1", chapters, setup, handle };
  window.addEventListener("DOMContentLoaded", () => { A = SL.app(ep); });
})();
