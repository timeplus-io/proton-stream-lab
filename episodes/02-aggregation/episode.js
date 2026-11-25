/* Episode 2: streaming aggregation (global, tumble, hop, watermark, late events, delay, checkpoint). */
(() => {
  const KEYS = ["A", "B", "C"];
  const T = { x0: 20, nowX: 320, y: 96, pps: 56 };
  const ST = { x: 345, y: 24, w: 180, h: 176, slotX: 435, slotY: 172 };
  const LATE = { x: 345, y: 214, w: 180, h: 116 };
  const CK = { x: 20, y: 214, w: 305, h: 116 };
  const AG = { x: 550, y: 24, w: 630, h: 306 };
  const AX = { y: 268, x0: 574, x1: 1160, tMax: 30, top: 92 };
  const OUT = { y: 350, h: 240 };
  const X = (t) => AX.x0 + (t * (AX.x1 - AX.x0)) / AX.tMax;

  let A, L, tape, out, S;

  const ev = (id, key, et, at) => ({ id, key, et, at });
  const SCRIPTS = {
    global: [
      ev(1, "A", 1, 0.6), ev(2, "B", 1, 1.1), ev(3, "A", 2, 1.7), ev(4, "C", 2, 2.5), ev(5, "A", 3, 3.2), ev(6, "B", 4, 3.9),
      ev(7, "A", 5, 4.6), ev(8, "C", 6, 6.3), ev(9, "B", 6, 6.8), ev(10, "A", 8, 7.4), ev(11, "B", 9, 8.6), ev(12, "C", 9, 9.1),
    ],
    tumble: [
      ev(1, "A", 1, 1.0), ev(2, "B", 2, 1.7), ev(3, "A", 3, 2.4), ev(4, "C", 4, 3.1), ev(5, "B", 6, 3.8), ev(6, "A", 7, 4.5),
      ev(7, "C", 8, 5.2), ev(8, "A", 9, 5.9), ev(9, "A", 11, 6.6), ev(10, "B", 12, 7.3), ev(11, "C", 14, 8.0), ev(12, "B", 16, 8.7),
    ],
    late: [
      ev(1, "A", 1, 1.0), ev(2, "B", 3, 1.6), ev(3, "C", 2, 2.2), ev(4, "A", 6, 3.0), ev(5, "B", 4, 3.6), ev(6, "C", 7, 4.2),
      ev(7, "A", 9, 5.0), ev(8, "B", 8, 5.6), ev(9, "C", 11, 6.4), ev(10, "A", 10, 7.0), ev(11, "B", 14, 7.6), ev(12, "C", 16, 8.4),
      ev(13, "B", 13, 9.0), ev(14, "A", 18, 9.8),
    ],
    hop: [
      ev(1, "A", 6, 1.0), ev(2, "B", 7, 1.8), ev(3, "C", 8, 2.6), ev(4, "A", 11, 3.4), ev(5, "B", 12, 4.2), ev(6, "A", 14, 5.0),
      ev(7, "C", 16, 5.8), ev(8, "B", 17, 6.6), ev(9, "A", 19, 7.4), ev(10, "C", 21, 8.2), ev(11, "A", 22, 9.0), ev(12, "B", 26, 9.8),
    ],
    ckpt: [
      ev(1, "A", 1, 1.0), ev(2, "B", 2, 1.8), ev(3, "C", 3, 2.6), ev(4, "A", 6, 3.4), ev(5, "B", 7, 4.2), ev(6, "A", 8, 5.0),
      ev(7, "C", 9, 6.2), ev(8, "B", 11, 7.0), ev(9, "A", 12, 7.8), ev(10, "C", 14, 9.4), ev(11, "B", 16, 10.2),
    ],
  };

  const PG = { mode: "tumble", delay: 0, disorder: "low", seed: 7 };
  function randomScript() {
    const r = SL.rng(PG.seed);
    const evs = [];
    for (let i = 0; i < 22; i++) {
      const at = Math.round((0.8 + i * 0.62 + r() * 0.2) * 10) / 10;
      let et = 1 + i * 1.2;
      const p = r();
      if (PG.disorder === "low") { if (p < 0.2) et -= 1 + r() * 1.5; }
      else if (p < 0.35) et -= 1 + r() * 5.5;
      et = Math.max(0, Math.min(29, Math.round(et)));
      evs.push(ev(i + 1, KEYS[Math.floor(r() * 3)], et, at));
    }
    return evs;
  }

  const sqlWin = (from, extra = "") => `SELECT window_start, device, count() AS cnt\nFROM ${from}\nGROUP BY window_start, device${extra};`;
  const chapters = [
    {
      id: "global", title: "Global aggregation", short: "EMIT PERIODIC, the default", sub: "No window: one running count per key",
      cfg: { mode: "global", emit: "periodic" }, script: "global",
      sql: `SELECT device, count() AS cnt\nFROM sensors\nGROUP BY device\nEMIT PERIODIC 2s;   -- the default for global aggregation`,
      body: [
        "This is the first query in the series that has to <b>remember</b>. The aggregating transform keeps a hash table with one entry per key, and every event updates its key's entry. Nothing is ever closed.",
        "Without windows there is no event-time deadline, so output is driven by processing time. Every 2 seconds a periodic watermark asks the transform to emit, and it emits the current value of <i>every</i> key.",
      ],
      watch: [
        "The blocks stacked in each lane are the state: the count for that key is the height of the stack.",
        "Each periodic emit repeats keys that did not change. With hundreds of thousands of keys that is hundreds of thousands of rows every 2 seconds, which is how one customer overloaded a cluster.",
      ],
      refs: ["<code>WatermarkStamper::processPeriodic</code> in <code>src/Processors/Transforms/Streaming/WatermarkStamper.cpp</code> stamps the processing-time watermark.", "<code>GlobalAggregatingTransform</code> holds the state and emits on each watermark."],
    },
    {
      id: "on-update", title: "Emit only what changed", short: "EMIT ON UPDATE", sub: "Global aggregation, emit per batch",
      cfg: { mode: "global", emit: "onupdate" }, script: "global",
      sql: `SELECT device, count() AS cnt\nFROM sensors\nGROUP BY device\nEMIT ON UPDATE;`,
      body: [
        "<code>EMIT ON UPDATE</code> stamps a watermark on every batch, and the transform emits only the keys that received rows in that batch.",
        "Proton does not compare old and new results. A key counts as changed when it got new input, even if its result came out the same (for example a <code>max()</code> that didn't move).",
      ],
      watch: ["One output row per event, because each event is its own batch here. Real batches hold many rows, so one emit covers many keys.", "<code>EMIT ON UPDATE WITH BATCH 1s</code> keeps the \"changed keys only\" rule but flushes on an interval."],
      refs: ["<code>WatermarkStamper::stampIfOnUpdate</code> sets a watermark on every chunk in ON UPDATE mode."],
    },
    {
      id: "tumble", title: "Tumbling window and watermark", short: "Windows close by event time", sub: "tumble(sensors, 5s)",
      cfg: { mode: "tumble", size: 5 }, script: "tumble",
      sql: sqlWin("tumble(sensors, 5s)", "\n-- EMIT AFTER WINDOW CLOSE is the default"),
      body: [
        "<code>tumble()</code> puts each event in a 5-second window by its <b>event time</b>. The state is one bucket per window, with a count per key.",
        "The watermark transform tracks the largest event time seen so far and sets the watermark to the start of that event's window. When the watermark reaches a window's end, the window is final: its rows are emitted once and its bucket is freed.",
      ],
      watch: [
        "Window [0s, 5s) closes the moment the first event with event time 5s or later arrives (#5 at 6s).",
        "After a window is emitted its bucket disappears, so tumble state stays small no matter how long the query runs.",
      ],
      refs: [
        "<code>WatermarkStamper::calculateWatermark</code>: for tumble, <code>toStartTime(max_event_ts − delay)</code>.",
        "<code>WindowAggregatingTransform::finalize</code> emits windows with <code>window.end &lt;= watermark</code>, then <code>clearExpiredState</code> frees them.",
        "Pipeline: source → <code>TumbleWindowAssignmentTransform</code> → <code>WatermarkTransform</code> → <code>TumbleAggregatingTransform</code>.",
      ],
    },
    {
      id: "late", title: "Out-of-order and late events", short: "Late rows are dropped", sub: "tumble(sensors, 5s), no delay",
      cfg: { mode: "tumble", size: 5, delay: 0 }, script: "late",
      sql: sqlWin("tumble(sensors, 5s)"),
      body: [
        "Events don't always arrive in event-time order. Inside a window the watermark hasn't passed yet, order doesn't matter: the event lands in its bucket.",
        "An event whose event time is behind the watermark is <b>late</b>. Its window may already be emitted, so Proton drops it and counts it.",
      ],
      watch: [
        "#3 (2s) arrives after #2 (3s) and still counts: the watermark is still 0s.",
        "#5 (4s) arrives after the watermark moved to 5s. It turns grey and goes to the late tray. So does #13.",
        "Undercounted windows in production usually mean late events. Look for <code>Found N late events … Last projected watermark</code> in the server log.",
      ],
      refs: ["<code>WatermarkStamper::processWatermarkImpl</code> filters rows with <code>event_ts &lt; watermark</code>.", "<code>WatermarkStamper::logLateEvents</code> writes the late-event log line."],
    },
    {
      id: "delay", title: "Waiting for stragglers", short: "WITH DELAY", sub: "Same events, 2-second delay",
      cfg: { mode: "tumble", size: 5, delay: 2 }, script: "late",
      sql: `SELECT window_start, device, count() AS cnt\nFROM tumble(sensors, 5s)\nGROUP BY window_start, device\nEMIT AFTER WINDOW CLOSE WITH DELAY 2s;`,
      body: [
        "<code>WITH DELAY 2s</code> subtracts 2 seconds from the max event time before aligning it to a window start. The watermark lags behind the newest event.",
        "Late events within the delay are now counted, and every result comes out later. You are trading latency for completeness.",
      ],
      watch: ["Same events as the previous chapter. #5 and #13 are now counted.", "Window [0s, 5s) now closes when event time 7s shows up (#6), not 6s."],
      refs: ["<code>calculateWatermark</code> applies <code>delay_interval</code> before <code>toStartTime</code>."],
    },
    {
      id: "hop", title: "Hopping windows share buckets", short: "hop(…, 5s, 10s)", sub: "10-second windows, a new one every 5s",
      cfg: { mode: "hop", size: 10, slide: 5 }, script: "hop",
      sql: sqlWin("hop(sensors, 5s, 10s)"),
      body: [
        "A hop window is 10 seconds long and a new one starts every 5 seconds, so each event belongs to two windows.",
        "Proton doesn't copy the event into both. It keeps state in 5-second buckets and builds each window's result from the buckets it covers. A bucket is freed only after the last window that needs it has been emitted.",
      ],
      watch: ["Each bucket feeds two results: bucket [5s, 10s) is part of [0s, 10s) and [5s, 15s).", "Bucket [5s, 10s) survives the close of [0s, 10s) because [5s, 15s) still needs it."],
      refs: ["<code>HopWindowHelper::getLastFinalizedWindow</code> sets the hop watermark.", "<code>HopAggregatingTransform</code> merges buckets per window."],
    },
    {
      id: "checkpoint", title: "Checkpoint and recovery", short: "State survives a crash", sub: "Materialized view over tumble(…, 5s)",
      cfg: { mode: "tumble", size: 5, ckpt: { after: 6, crashAfter: 9 } }, script: "ckpt",
      sql: `CREATE MATERIALIZED VIEW device_counts_mv\nINTO device_counts AS\nSELECT window_start, device, count() AS cnt\nFROM tumble(sensors, 5s)\nGROUP BY window_start, device;`,
      body: [
        "A materialized view runs forever, so its state must survive a restart. The checkpoint coordinator injects a barrier at the source; the source records its sequence number (sn) and passes the barrier downstream.",
        "Each stateful operator saves its state when the barrier reaches it: the watermark transform saves its watermark, the aggregator saves its buckets. When the barrier reaches the sink, the checkpoint is committed. After a crash, Proton restores that state and re-reads the source from the saved sn.",
      ],
      watch: [
        "The checkpoint holds bucket [5s, 10s) with three events and watermark 5s.",
        "Window [5s, 10s) is emitted, then the process crashes. After recovery the same window closes again and its rows are emitted a second time. A keyed target (a mutable stream) absorbs the repeat.",
      ],
      refs: [
        "<code>src/Checkpoint/CheckpointCoordinator.cpp</code> schedules checkpoints: by default every 60 s for most views, 15 min once state is large.",
        "<code>AggregatingTransform_Checkpoint.cpp</code> and <code>WatermarkTransformWithSubstream_Checkpoint.cpp</code> serialize the state.",
      ],
    },
    {
      id: "playground", title: "Playground", short: "Try your own settings", sub: "Random stream, your settings", playground: true,
      cfg: null, script: "random",
      sql: "",
      body: ["Pick a window type, a delay and how disordered the stream is, then press Play. Change any setting to start over with the same stream, or draw a new one."],
      watch: ["High disorder with no delay drops many events. Add delay and watch the late tray empty while results arrive later.", "Hop windows emit every slide but keep each bucket for two windows."],
      refs: ["All rules are the same as in the scripted chapters."],
    },
  ];

  function pgCfg() {
    if (PG.mode === "global") return { mode: "global", emit: "periodic" };
    if (PG.mode === "onupdate") return { mode: "global", emit: "onupdate" };
    if (PG.mode === "hop") return { mode: "hop", size: 10, slide: 5, delay: PG.delay };
    return { mode: "tumble", size: 5, delay: PG.delay };
  }
  function pgSql() {
    if (PG.mode === "global") return `SELECT device, count() AS cnt\nFROM sensors\nGROUP BY device\nEMIT PERIODIC 2s;`;
    if (PG.mode === "onupdate") return `SELECT device, count() AS cnt\nFROM sensors\nGROUP BY device\nEMIT ON UPDATE;`;
    const from = PG.mode === "hop" ? "hop(sensors, 5s, 10s)" : "tumble(sensors, 5s)";
    return `SELECT window_start, device, count() AS cnt\nFROM ${from}\nGROUP BY window_start, device${PG.delay ? `\nEMIT AFTER WINDOW CLOSE WITH DELAY ${PG.delay}s` : ""};`;
  }
  function renderPlayground(el, reload) {
    const opt = (v, t, cur) => `<option value="${v}"${v === String(cur) ? " selected" : ""}>${t}</option>`;
    el.innerHTML = `
      <label>Aggregation<select id="pg-mode">${opt("global", "Global, EMIT PERIODIC", PG.mode)}${opt("onupdate", "Global, EMIT ON UPDATE", PG.mode)}${opt("tumble", "Tumble 5s", PG.mode)}${opt("hop", "Hop 10s every 5s", PG.mode)}</select></label>
      <label>Delay<select id="pg-delay"${PG.mode.startsWith("g") || PG.mode === "onupdate" ? " disabled" : ""}>${opt("0", "none", PG.delay)}${opt("2", "2s", PG.delay)}${opt("4", "4s", PG.delay)}</select></label>
      <label>Disorder<select id="pg-dis">${opt("low", "low", PG.disorder)}${opt("high", "high", PG.disorder)}</select></label>
      <button class="btn" id="pg-new" type="button">New random stream</button>`;
    el.querySelector("#pg-mode").onchange = (e) => { PG.mode = e.target.value; reload(); };
    el.querySelector("#pg-delay").onchange = (e) => { PG.delay = +e.target.value; reload(); };
    el.querySelector("#pg-dis").onchange = (e) => { PG.disorder = e.target.value; reload(); };
    el.querySelector("#pg-new").onclick = () => { PG.seed = Math.floor(Math.random() * 1e6); reload(); };
    document.querySelector("#ch-sql").textContent = pgSql();
  }

  /* ---------- stage ---------- */
  function setup(ch) {
    const cfg = { delay: 0, emit: "close", ...(ch.cfg || pgCfg()) };
    if (cfg.mode === "tumble") cfg.slide = cfg.size;
    const script = ch.script === "random" ? randomScript() : SCRIPTS[ch.script];
    const svg = d3.select("#stage").attr("viewBox", "0 0 1200 600");
    svg.selectAll("*").remove();
    SL.defs(svg);
    L = { bg: svg.append("g"), win: svg.append("g"), wm: svg.append("g"), tape: svg.append("g"), blocks: svg.append("g"), fx: svg.append("g"), out: svg.append("g"), top: svg.append("g") };
    tape = new SL.Tape(L.bg, L.tape, { ...T, label: "Source · sensors stream", sub: "waiting events, spaced by arrival time" });
    S = { cfg, ch, clock: 0, wm: null, maxEt: null, fin: -Infinity, buckets: new Map(), late: [], readSn: 0, emitted: new Set(), ckpt: null, ckN: 0, evs: [] };

    S.clockTxt = L.bg.append("text").attr("class", "clock-big").attr("x", T.nowX).attr("y", T.y - 34).attr("text-anchor", "end").text("00:00.0");
    SL.flowArrow(L.bg, T.nowX + 6, T.y, ST.x - 6, T.y);
    SL.flowArrow(L.bg, ST.x + ST.w + 4, T.y, AG.x - 6, T.y);
    SL.flowArrow(L.bg, 1176, AG.y + AG.h + 2, 1176, OUT.y - 4);

    // watermark box
    const global = cfg.mode === "global";
    SL.boxWithTitle(L.bg, { x: ST.x, y: ST.y, w: ST.w, h: ST.h, title: global ? "Periodic watermark" : "Watermark", sub: global ? "processing time" : "event time" });
    const row = (i, label) => {
      L.bg.append("text").attr("class", "lbl").attr("x", ST.x + 14).attr("y", ST.y + 64 + i * 22).text(label);
      return L.bg.append("text").attr("class", "val" + (i === 1 ? " wm" : "")).attr("x", ST.x + ST.w - 14).attr("y", ST.y + 64 + i * 22).attr("text-anchor", "end").text("—");
    };
    if (global) {
      S.v1 = row(0, cfg.emit === "periodic" ? "emit every" : "watermark"); S.v2 = row(1, cfg.emit === "periodic" ? "next in" : ""); S.v3 = row(2, "event time");
      S.v1.text(cfg.emit === "periodic" ? "2.0s" : "every batch"); S.v2.text(cfg.emit === "periodic" ? "2.0s" : ""); S.v3.text("not used");
    } else {
      S.v1 = row(0, "max event time"); S.v2 = row(1, "watermark"); S.v3 = row(2, "delay");
      S.v3.text(`${cfg.delay}s`);
    }

    // late tray
    if (!global) {
      L.bg.append("rect").attr("class", "box-soft").attr("x", LATE.x).attr("y", LATE.y).attr("width", LATE.w).attr("height", LATE.h).attr("rx", 8);
      L.bg.append("text").attr("class", "lbl").attr("x", LATE.x + 12).attr("y", LATE.y + 20).text("Late events · dropped");
      S.lateCount = L.bg.append("text").attr("class", "val").attr("x", LATE.x + LATE.w - 12).attr("y", LATE.y + 20).attr("text-anchor", "end").text("0");
    }
    // checkpoint store
    if (cfg.ckpt) {
      const g = SL.boxWithTitle(L.bg, { x: CK.x, y: CK.y, w: CK.w, h: CK.h, title: "Checkpoint storage", sub: "nothing saved yet" });
      S.ckSub = g.select(".box-sub");
      S.ckLayer = L.bg.append("g");
    }

    // aggregator
    const aggName = global ? "GlobalAggregatingTransform" : cfg.mode === "hop" ? "HopAggregatingTransform" : "TumbleAggregatingTransform";
    L.bg.append("rect").attr("class", "box").attr("x", AG.x).attr("y", AG.y).attr("width", AG.w).attr("height", AG.h).attr("rx", 10);
    L.bg.append("text").attr("class", "box-title").attr("x", AG.x + 14).attr("y", AG.y + 22).text(`Aggregating transform · state`);
    L.bg.append("text").attr("class", "box-sub").attr("x", AG.x + AG.w - 14).attr("y", AG.y + 22).attr("text-anchor", "end").text(aggName);
    if (global) drawGlobal(); else drawWindows();

    // output
    L.bg.append("rect").attr("class", "box").attr("x", 20).attr("y", OUT.y).attr("width", 1160).attr("height", OUT.h).attr("rx", 10);
    L.bg.append("text").attr("class", "box-title").attr("x", 34).attr("y", OUT.y + 22).text(cfg.ckpt ? "Target stream · device_counts" : "Output rows");
    L.bg.append("text").attr("class", "box-sub").attr("x", 1166).attr("y", OUT.y + 22).attr("text-anchor", "end").text("newest last · time = processing time when emitted");
    out = new SL.OutGrid(L.out, { x: 34, y: OUT.y + 54, cols: 4, rows: 5, cw: 287, rh: 36, w: 274 });

    S.evs = script.map((e, i) => ({ ...e, sn: i + 1 }));
    S.evs.forEach((e) => tape.add(e, 0));

    const q = S.evs.map((e) => ({ type: "ev", ev: e, at: e.at }));
    const end = S.evs[S.evs.length - 1].at;
    if (global && cfg.emit === "periodic") for (let t = 2; t <= end + 2.01; t += 2) q.push({ type: "tick", at: t });
    if (cfg.ckpt) {
      const a = S.evs[cfg.ckpt.after - 1], b = S.evs[cfg.ckpt.after];
      q.push({ type: "ckpt", at: (a.at + b.at) / 2 });
      const c = S.evs[cfg.ckpt.crashAfter - 1], d = S.evs[cfg.ckpt.crashAfter];
      q.push({ type: "crash", at: (c.at + d.at) / 2 });
    }
    q.sort((x, y) => x.at - y.at);
    if (ch.playground) d3.select("#ch-sql").text(pgSql());
    return q;
  }

  /* global layout: one lane per key */
  const GL = { xs: [705, 865, 1025], base: 246 };
  function drawGlobal() {
    S.buckets.set("all", { A: [], B: [], C: [] });
    S.countTxt = {};
    KEYS.forEach((k, i) => {
      const x = GL.xs[i];
      L.bg.append("rect").attr("class", "box-soft").attr("x", x - 62).attr("y", 72).attr("width", 124).attr("height", 196).attr("rx", 8);
      L.bg.append("circle").attr("cx", x - 30).attr("cy", 288).attr("r", 6).style("fill", SL.keyColor(k));
      S.countTxt[k] = L.bg.append("text").attr("class", "val").attr("x", x - 18).attr("y", 292).text(`${k} · count 0`);
    });
    L.bg.append("text").attr("class", "muted-txt").attr("x", AG.x + 14).attr("y", 318).text("hash table: one entry per key, never closed");
  }
  function globalPos(k, j) { const i = KEYS.indexOf(k); return { x: GL.xs[i] + ((j % 3) - 1) * 32, y: GL.base - Math.floor(j / 3) * 34 }; }

  /* windowed layout: event-time axis with buckets and window brackets */
  function windows() {
    const { size, slide } = S.cfg, res = [];
    for (let s = 0; s + size <= AX.tMax; s += slide) res.push({ s, e: s + size, row: S.cfg.mode === "hop" ? (s / slide) % 2 : 0 });
    return res;
  }
  function drawWindows() {
    const { slide } = S.cfg;
    S.cols = new Map();
    for (let b = 0; b < AX.tMax; b += slide) {
      const r = L.bg.append("rect").attr("class", "box-soft").attr("x", X(b) + 2).attr("y", AX.top).attr("width", X(slide) - X(0) - 4).attr("height", AX.y - AX.top).attr("rx", 6);
      S.cols.set(b, r);
    }
    L.bg.append("line").attr("class", "tick").attr("x1", AX.x0).attr("x2", AX.x1).attr("y1", AX.y).attr("y2", AX.y).style("stroke", "var(--muted)");
    for (let t = 0; t <= AX.tMax; t += 5) {
      L.bg.append("line").attr("class", "tick").attr("x1", X(t)).attr("x2", X(t)).attr("y1", AX.y).attr("y2", AX.y + 5).style("stroke", "var(--muted)");
      L.bg.append("text").attr("class", "tick-lbl").attr("x", X(t)).attr("y", AX.y + 16).text(`${t}s`);
    }
    L.bg.append("text").attr("class", "box-sub").attr("x", AG.x + 14).attr("y", AG.y + 40).text(`event time → · one bucket per ${slide}s · lanes A B C`);
    S.brackets = new Map();
    windows().forEach((w) => {
      const y = AX.y + 24 + w.row * 18;
      const g = L.win.append("g").attr("class", "bracket");
      g.append("rect").attr("x", X(w.s) + 3).attr("y", y).attr("width", X(w.e) - X(w.s) - 6).attr("height", 14).attr("rx", 3)
        .style("fill", "none").style("stroke", "var(--muted)").style("stroke-width", 1.2);
      g.append("text").attr("class", "tick-lbl").attr("x", (X(w.s) + X(w.e)) / 2).attr("y", y + 10.5).text(`[${w.s}s, ${w.e}s)`);
      S.brackets.set(w.s, g);
    });
    // watermark line
    S.wmShade = L.wm.append("rect").attr("class", "wm-shade").attr("x", X(0)).attr("y", AX.top).attr("width", 0).attr("height", AX.y - AX.top);
    S.wmLine = L.wm.append("line").attr("class", "wm-line").attr("x1", X(0)).attr("x2", X(0)).attr("y1", AX.top - 4).attr("y2", AX.y).style("opacity", 0);
    S.wmTagG = SL.wmTag(L.wm); SL.place(S.wmTagG, X(0), AX.top - 11); S.wmTagG.style("opacity", 0);
  }
  function lanePos(b, k, j) {
    const w = X(S.cfg.slide) - X(0);
    return { x: X(b) + (w * (KEYS.indexOf(k) + 0.5)) / 3, y: AX.y - 22 - j * 34 };
  }
  function bucketOf(et) { return Math.floor(et / S.cfg.slide) * S.cfg.slide; }
  function calcWm(maxEt) {
    const v = maxEt - S.cfg.delay;
    if (v < 0) return null;
    return Math.floor(v / S.cfg.slide) * S.cfg.slide;
  }
  function renderBrackets() {
    S.brackets.forEach((g, s) => {
      const done = s + S.cfg.size <= S.fin;
      g.style("opacity", done ? 0.35 : 1);
      g.select("rect").style("stroke", "var(--muted)").style("fill", "none");
    });
  }

  const setClock = (t) => {
    S.clock = t; S.clockTxt.text(SL.fmt(t));
    if (S.cfg.mode === "global" && S.cfg.emit === "periodic") { const n = 2 - (t % 2); S.v2.text(`${(n > 1.999 ? 2 : n).toFixed(1)}s`); }
  };

  async function handle(it) {
    await SL.clockTo({ get clock() { return S.clock; }, setClock: (t) => { setClock(t); A.setClock(t); } }, [tape], it.at);
    if (it.type === "ev") return onEvent(it.ev);
    if (it.type === "tick") return onTick();
    if (it.type === "ckpt") return onCkpt();
    if (it.type === "crash") return onCrash();
  }

  async function onEvent(e) {
    const g = tape.take(e, L.blocks);
    S.readSn = Math.max(S.readSn, e.sn);
    await SL.W(SL.move(g, ST.slotX, ST.slotY, 380));
    const item = { ev: e, g };

    if (S.cfg.mode === "global") {
      const lane = S.buckets.get("all")[e.key];
      lane.push(item);
      const p = globalPos(e.key, lane.length - 1);
      await SL.W(SL.move(g, p.x, p.y, 420));
      S.countTxt[e.key].text(`${e.key} · count ${lane.length}`);
      A.log(`#${e.id} (key ${e.key}) → count for ${e.key} is now ${lane.length}`);
      if (S.cfg.emit === "onupdate") {
        A.log(`ON UPDATE: watermark on this batch → emit ${e.key} only`);
        await emitRows([{ key: e.key, text: `${e.key}  count ${lane.length}`, from: { x: p.x, y: p.y - 20 } }]);
      }
      return;
    }

    if (S.wm != null && e.et < S.wm) {
      g.classed("late", true);
      const i = S.late.length; S.late.push(item);
      A.log(`#${e.id} event time ${e.et}s < watermark ${S.wm}s → late, dropped`);
      S.lateCount.text(String(S.late.length));
      await SL.W(SL.move(g, LATE.x + 24 + (i % 5) * 32, LATE.y + 52 + Math.floor(i / 5) * 40, 420));
      return;
    }
    S.maxEt = S.maxEt == null ? e.et : Math.max(S.maxEt, e.et);
    S.v1.text(`${S.maxEt}s`);
    const b = bucketOf(e.et);
    if (!S.buckets.has(b)) S.buckets.set(b, { A: [], B: [], C: [] });
    const lane = S.buckets.get(b)[e.key];
    lane.push(item);
    const p = lanePos(b, e.key, lane.length - 1);
    A.log(`#${e.id} (key ${e.key}, ${e.et}s) → bucket [${b}s, ${b + S.cfg.slide}s)`);
    await SL.W(SL.move(g, p.x, p.y, 440));
    const nwm = calcWm(S.maxEt);
    if (nwm != null && (S.wm == null || nwm > S.wm)) {
      A.log(`Max event time ${S.maxEt}s${S.cfg.delay ? ` − delay ${S.cfg.delay}s` : ""} → watermark ${nwm}s`);
      await setWm(nwm);
      await finalize();
    }
  }

  async function setWm(w, ms = 420) {
    S.wm = w;
    S.v2.text(w == null ? "—" : `${w}s`);
    if (w == null) { S.wmLine.style("opacity", 0); S.wmTagG.style("opacity", 0); S.wmShade.attr("width", 0); return; }
    S.wmTagG.select("text").text(`WM ${w}s`);
    S.wmLine.style("opacity", 1); S.wmTagG.style("opacity", 1);
    await SL.all([
      SL.done(SL.tr(S.wmLine, ms).attr("x1", X(w)).attr("x2", X(w))),
      SL.done(SL.tr(S.wmShade, ms).attr("width", X(w) - X(0))),
      SL.move(S.wmTagG, X(w), AX.top - 11, ms),
    ]);
  }

  async function finalize() {
    const { size } = S.cfg;
    for (const w of windows()) {
      if (w.e > S.wm || w.e <= S.fin) continue;
      const counts = { A: 0, B: 0, C: 0 };
      const blocks = [];
      S.buckets.forEach((lanes, b) => { if (b >= w.s && b < w.e) KEYS.forEach((k) => { counts[k] += lanes[k].length; blocks.push(...lanes[k]); }); });
      const br = S.brackets.get(w.s);
      br.select("rect").style("stroke", "var(--wm)").style("fill", "var(--wm-soft)");
      await SL.all(blocks.map((x) => SL.move(x.g, SL.pos(x.g).x, SL.pos(x.g).y, 160, { scale: 1.18 })));
      await SL.all(blocks.map((x) => SL.move(x.g, SL.pos(x.g).x, SL.pos(x.g).y, 160)));
      const rows = KEYS.filter((k) => counts[k] > 0);
      S.fin = w.e;
      if (!rows.length) { A.log(`Window [${w.s}s, ${w.e}s) is final: no rows`); renderBrackets(); continue; }
      A.log(`Window [${w.s}s, ${w.e}s) is final (end ≤ watermark) → emit ${rows.map((k) => `${k}=${counts[k]}`).join(", ")}`);
      const y = AX.y + 31 + w.row * 18;
      await emitRows(rows.map((k) => ({ key: k, win: w.s, text: `[${w.s}s, ${w.e}s)  ${k}  count ${counts[k]}`, from: { x: (X(w.s) + X(w.e)) / 2, y } })));
      renderBrackets();
    }
    // free buckets no open window needs
    const freed = [];
    S.buckets.forEach((lanes, b) => {
      if (b + size <= S.wm) {
        KEYS.forEach((k) => lanes[k].forEach((x) => SL.fadeOut(x.g, 380, 14)));
        S.buckets.delete(b);
        freed.push(b);
      }
    });
    for (let b = 0; b < AX.tMax; b += S.cfg.slide) if (b + size <= S.wm) S.cols.get(b).style("opacity", 0.4);
    if (freed.length) { A.log(`State freed: bucket ${freed.map((b) => `[${b}s, ${b + S.cfg.slide}s)`).join(", ")}`); await SL.sleep(380); }
  }

  async function emitRows(rows) {
    const ps = [];
    for (const r of rows) {
      const id = `${r.win ?? "g"}|${r.key}`;
      const dup = r.win != null && S.emitted.has(id);
      if (r.win != null) S.emitted.add(id);
      ps.push(out.add({ key: r.key, text: r.text, time: `@${SL.fmt(S.clock)}`, dup, flag: dup ? "again" : null }, r.from));
      await SL.sleep(110);
    }
    await SL.all(ps);
  }

  async function onTick() {
    const pulse = SL.wmTag(L.fx); pulse.select("text").text("emit");
    SL.place(pulse, ST.slotX, ST.slotY - 6);
    await SL.W(SL.move(pulse, AG.x + 40, ST.slotY - 6, 380));
    SL.fadeOut(pulse, 200);
    const lanes = S.buckets.get("all");
    const rows = KEYS.filter((k) => lanes[k].length);
    if (!rows.length) { A.log("Periodic watermark: nothing to emit yet"); return SL.sleep(200); }
    A.log(`Periodic watermark at ${SL.fmt(S.clock)} → emit every key: ${rows.map((k) => `${k}=${lanes[k].length}`).join(", ")}`);
    await emitRows(rows.map((k) => { const p = globalPos(k, Math.max(0, lanes[k].length - 1)); return { key: k, text: `${k}  count ${lanes[k].length}`, from: { x: p.x, y: p.y - 20 } }; }));
  }

  /* ---------- checkpoint & crash ---------- */
  async function onCkpt() {
    const n = ++S.ckN;
    const bar = SL.barrier(L.top, n);
    SL.place(bar, T.nowX, T.y); bar.style("opacity", 0); SL.tr(bar, 200).style("opacity", 1);
    A.log(`Checkpoint ${n}: barrier injected after sn ${S.readSn}; the source saves sn ${S.readSn}`);
    const snap = { n, sn: S.readSn, wm: S.wm, maxEt: S.maxEt, fin: S.fin, buckets: [] };
    await SL.sleep(300);
    await SL.W(SL.move(bar, ST.slotX, ST.slotY - 40, 420));
    A.log(`Watermark transform saves watermark ${S.wm}s and max event time ${S.maxEt}s`);
    await SL.sleep(200);
    await SL.W(SL.move(bar, AG.x + 18, 150, 420));
    // snapshot buckets
    S.buckets.forEach((lanes, b) => KEYS.forEach((k) => lanes[k].forEach((x, j) => snap.buckets.push({ b, k, j, ev: x.ev }))));
    S.ckLayer.selectAll("*").remove();
    const minis = snap.buckets.map((it, i) => {
      const g = SL.block(S.ckLayer, it.ev, { tag: false });
      const p = SL.pos(findItem(it.ev).g);
      SL.place(g, p.x, p.y);
      it.mx = CK.x + 26 + i * 24; it.my = CK.y + 92;
      return SL.move(g, it.mx, it.my, 600, { scale: 0.7 });
    });
    const desc = snap.buckets.length ? groupDesc(snap.buckets) : "empty";
    A.log(`Aggregator saves its state: ${desc}`);
    await SL.all(minis);
    S.ckSub.text(`ckpt ${n}: source sn ${snap.sn}, watermark ${snap.wm}s`);
    S.ckLayer.append("text").attr("class", "lbl").attr("x", CK.x + 14).attr("y", CK.y + 62).text(desc);
    await SL.W(SL.move(bar, 1176, OUT.y + 14, 460));
    S.ckSub.text(`ckpt ${n} ✓ committed · sn ${snap.sn} · WM ${snap.wm}s`).style("fill", "var(--ok)");
    A.log(`Barrier reached the sink: checkpoint ${n} committed`);
    S.ckpt = snap;
    await SL.fadeOut(bar, 250);
  }
  function groupDesc(items) {
    const m = new Map();
    items.forEach((it) => { const k = `[${it.b}s,${it.b + S.cfg.slide}s)`; m.set(k, (m.get(k) || "") + it.k); });
    return [...m].map(([w, ks]) => `${w} ${KEYS.filter((k) => ks.includes(k)).map((k) => `${k}×${[...ks].filter((c) => c === k).length}`).join(" ")}`).join("; ");
  }
  function findItem(e) {
    let f = null;
    S.buckets.forEach((lanes) => KEYS.forEach((k) => lanes[k].forEach((x) => { if (x.ev === e) f = x; })));
    return f;
  }

  async function onCrash() {
    const flash = L.top.append("rect").attr("class", "crash").attr("x", ST.x).attr("y", AG.y).attr("width", AG.x + AG.w - ST.x).attr("height", AG.h).attr("rx", 10);
    await SL.W(SL.done(SL.tr(flash, 160).style("opacity", 0.2)));
    const txt = L.top.append("text").attr("class", "danger-txt").attr("x", 865).attr("y", 160).attr("text-anchor", "middle").text("Crash: in-memory state and watermark are lost");
    A.log("Crash. The aggregator's buckets and the watermark are gone");
    const ps = [];
    S.buckets.forEach((lanes) => KEYS.forEach((k) => lanes[k].forEach((x) => ps.push(SL.fadeOut(x.g, 500, 30)))));
    S.late.forEach((x) => ps.push(SL.fadeOut(x.g, 500, 30)));
    await SL.all(ps);
    S.buckets.clear(); S.late = []; S.lateCount.text("0");
    S.maxEt = null; S.v1.text("—");
    await setWm(null);
    S.fin = -Infinity; renderBrackets();
    S.cols.forEach((r) => r.style("opacity", 1));
    await SL.sleep(500);
    SL.tr(flash, 300).style("opacity", 0).remove();
    SL.fadeOut(txt, 300);

    // restore
    const ck = S.ckpt;
    A.log(`Recover from checkpoint ${ck.n}: restore buckets, watermark ${ck.wm}s`);
    const moves = [];
    S.ckLayer.selectAll("g.blk").style("opacity", 0.35);
    ck.buckets.forEach((it) => {
      if (!S.buckets.has(it.b)) S.buckets.set(it.b, { A: [], B: [], C: [] });
      const g = SL.block(L.blocks, it.ev);
      SL.place(g, it.mx, it.my, 0.7);
      S.buckets.get(it.b)[it.k].push({ ev: it.ev, g });
      const p = lanePos(it.b, it.k, it.j);
      moves.push(SL.move(g, p.x, p.y, 650));
    });
    await SL.all(moves);
    S.maxEt = ck.maxEt; S.v1.text(`${ck.maxEt}s`);
    S.fin = ck.fin; renderBrackets();
    for (let b = 0; b < AX.tMax; b += S.cfg.slide) if (b + S.cfg.size <= ck.wm) S.cols.get(b).style("opacity", 0.4);
    await setWm(ck.wm);

    // rewind the source
    const again = S.evs.filter((e) => e.sn > ck.sn && e.sn <= S.readSn && !e.replay);
    const q = A.runner.queue;
    const step = 0.7, shift = step * (again.length + 1);
    q.forEach((x) => { x.at += shift; if (x.ev) x.ev.at = x.at; });
    const replays = again.map((e, i) => ({ ...e, uid: `${e.id}r`, replay: true, at: S.clock + step * (i + 1) }));
    replays.forEach((e) => { S.evs.push(e); tape.add(e, S.clock); });
    q.unshift(...replays.map((e) => ({ type: "ev", ev: e, at: e.at })));
    S.readSn = ck.sn;
    A.log(`Source rewinds to sn ${ck.sn + 1} and re-reads ${again.map((e) => "#" + e.id).join(", ")}`);
    await SL.W(tape.advance(S.clock, 600));
  }

  const ep = { id: "ep2", chapters, setup, handle, renderPlayground };
  window.addEventListener("DOMContentLoaded", () => { A = SL.app(ep); });
})();
