/* Episode 2: streaming aggregation. Same stage as episode 1, but the operator now keeps state.
   Input cards are routed to their key's row and absorbed into a hollow state card.
   The output is one stream: each record comes out of its key's state card and merges into one line. */
(() => {
  const W = 1200, H = 404, V = 96;
  const { w: CW } = Lab.CARD;
  const KEYS = ["A", "B", "C"];
  const ROW = { A: 118, B: 202, C: 286 }, IN_Y = ROW.B;
  const OP = { x: 198, y: 50, w: 264, h: 286, cx: 330 };   // left of center: the output side needs room for the watermark
  const AXIS_Y = 358;
  const MIN_GAP = (CW + 14) / V;
  const AHEAD = (OP.cx + CW) / V;
  const ROUTE = 0.9;      // seconds before arrival when a card turns toward its key's row
  const SLOT = (CW + 8) / V;   // output records leave one card apart
  const PERIOD = 5;       // EMIT PERIODIC interval in seconds
  const GROW = 1.0;       // seconds an output takes to leave its state card and reach the output line
  const WIN = 5;          // window size in seconds
  const t8 = (t) => Lab.hms(t).slice(0, 8);

  const TUMBLE = "SELECT window_start, device, count() FROM tumble(sensors, 5s) GROUP BY window_start, device";
  const modes = [
    {
      id: "global", label: "Global", agg: "global", emit: "periodic", rule: "count() by device",
      sql: "SELECT device, count() FROM sensors GROUP BY device EMIT PERIODIC 5s",
      note: "Now the operator has to <b>remember</b>. Each event joins its device's row and bumps the count kept in the hollow card: that is the state. Every 5 seconds the operator emits the current count of <i>every</i> device, changed or not: one record per device, one after another on the same output stream. Without <code>EMIT</code>, an aggregation with no window does this every 2 seconds.",
    },
    {
      id: "update", label: "On update", agg: "global", emit: "update", rule: "count() by device",
      sql: "SELECT device, count() FROM sensors GROUP BY device EMIT ON UPDATE",
      note: "Same state, different trigger. A result is emitted as soon as an event changes it, and only for the device that changed: one row out for each event in. There is no timer.",
    },
    {
      id: "tumble", label: "Tumble window", agg: "tumble", delay: 0, rule: "count() by device, 5s windows",
      sql: TUMBLE,
      note: "Time is cut into 5-second windows (the thin vertical lines). State is kept per window. The <b>watermark</b> (the gold dashed line) marks how far event time has got: it moves to a window's start when the first event of that window arrives. That closes the window before it: its counts are emitted once, one record per device, and its state is freed.",
    },
    {
      id: "late", label: "Late events", agg: "tumble", delay: 0, disorder: true, rule: "count() by device, 5s windows",
      sql: TUMBLE,
      note: "Here some events arrive after they happened: the time printed on the card is older than its place on the axis. If that time is still at or after the watermark (the gold dashed line), the event is counted in its own window. If it is behind the watermark, its window has already been emitted, so the event turns grey and is dropped.",
    },
    {
      id: "delay", label: "With delay", agg: "tumble", delay: 2, disorder: true, rule: "5s windows, delay 2s",
      sql: TUMBLE + " EMIT AFTER WINDOW CLOSE WITH DELAY 2s",
      note: "The same stream as the previous tab. The watermark (gold dashed line) now waits 2 seconds longer before it moves, so two windows can be open at once and fewer stragglers are dropped. The price: every result comes out later.",
    },
  ];

  let L, mode, rnd, seq, nextAt, nextTick, gen, wm, lastArrive, outFree;
  let inputs, outs, drops, state, clockTxt, opBox, wmG;
  const windowed = () => mode.agg === "tumble";

  function newEvent(at) {
    const key = KEYS[Math.floor(rnd() * 3)];
    const c = 26 + Math.floor(rnd() * 13);
    let et = at;
    if (mode.disorder && rnd() < 0.33) et = at - (3 + rnd() * 3);   // this one took a while to arrive
    const ev = { id: ++seq, key, keyLabel: `device ${key}`, val: c, valText: `${c} °C`, at, et };
    if (windowed()) {
      // Watermark rule from WatermarkStamper::calculateWatermark: start of the window holding (max event time - delay).
      ev.late = gen.wm != null && et < gen.wm;
      if (!ev.late) {
        gen.maxEt = Math.max(gen.maxEt, et);
        const w = Math.floor((gen.maxEt - mode.delay) / WIN) * WIN;
        if (gen.wm == null || w > gen.wm) gen.wm = w;
      }
      ev.wm = gen.wm;
    }
    return ev;
  }

  function init(svg, m) {
    mode = m; rnd = Lab.rng(m.disorder ? 180 : 42); seq = 0;
    inputs = []; outs = []; drops = []; state = new Map();
    gen = { maxEt: -Infinity, wm: null }; wm = null; lastArrive = -9; outFree = -Infinity;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    L = {
      bg: svg.append("g"), axis: svg.append("g").attr("class", "axis"), box: svg.append("g"), wm: svg.append("g"),
      out: svg.append("g"), in: svg.append("g"), state: svg.append("g"), top: svg.append("g"),
    };
    clockTxt = L.bg.append("text").attr("class", "clock").attr("x", OP.cx).attr("y", 34);

    const defs = svg.append("defs");
    [["fadeL", 0, 1], ["fadeR", 1, 0]].forEach(([id, a, b]) => {
      const gr = defs.append("linearGradient").attr("id", id);
      gr.append("stop").attr("offset", 0).attr("class", `fade-stop-${a}`);
      gr.append("stop").attr("offset", 1).attr("class", `fade-stop-${b}`);
    });
    L.top.append("rect").attr("x", 0).attr("y", OP.y).attr("width", 70).attr("height", H - OP.y).attr("fill", "url(#fadeL)");
    L.top.append("rect").attr("x", W - 70).attr("y", OP.y).attr("width", 70).attr("height", H - OP.y).attr("fill", "url(#fadeR)");

    L.bg.append("line").attr("class", "axis-line").attr("x1", 0).attr("x2", W).attr("y1", AXIS_Y).attr("y2", AXIS_Y);
    L.top.append("path").attr("class", "now-mark").attr("d", `M${OP.cx},${AXIS_Y - 1} l-6,-9 h12 z`);

    opBox = L.box.append("rect").attr("class", "op").attr("x", OP.x).attr("y", OP.y).attr("width", OP.w).attr("height", OP.h).attr("rx", 16);
    L.box.append("text").attr("class", "op-rule").attr("x", OP.cx).attr("y", OP.y + 22).text(m.rule);

    wmG = L.wm.append("g").attr("class", "wm").style("display", "none");
    wmG.append("line").attr("y1", OP.y).attr("y2", AXIS_Y);
    wmG.append("text").attr("y", AXIS_Y + 36);

    // warm up, so the first frame already shows state and output
    nextAt = -16; nextTick = -15;
    for (let t = -16; t < 0; t += 0.1) step(t);
    step(0); render(0);
  }

  /* ----- operator logic ----- */
  function ensureState(key) {
    if (!state.has(key)) {
      const g = Lab.stateCard(L.state, key, `device ${key}`).attr("transform", `translate(${OP.cx},${ROW[key]})`);
      state.set(key, { g, count: 0, wins: new Map() });
    }
    return state.get(key);
  }
  function showState(s) {
    if (windowed()) Lab.setState(s.g, [...s.wins.keys()].sort((a, b) => a - b).map((ws) => ({ l: t8(ws), r: s.wins.get(ws) })));
    else Lab.setState(s.g, [{ l: "count", r: s.count }]);
  }
  /* One output stream: one card per record, like the rows of the SQL result.
     A record is born at its key's state card and merges into the single output line.
     Records emitted at the same moment leave the operator one after another, because the line is one card wide.
     rows = [{ key, count, timeText }], all emitted at processing time T. */
  function emit(rows, T) {
    rows.forEach((r) => {
      const at = Math.max(T, outFree);
      outFree = at + SLOT;
      const g = Lab.card(L.out, { key: r.key, title: `device ${r.key}`, valText: `count ${r.count}`, timeText: r.timeText }).style("display", "none");
      outs.push({ g, T: at, y0: ROW[r.key] });
    });
  }

  function arrive(c) {
    const ev = c.ev;
    lastArrive = ev.at;
    if (ev.late) {                       // behind the watermark: dropped, never reaches the state
      L.top.node().appendChild(c.g.node());
      c.g.classed("dropped", true);
      drops.push({ g: c.g, at: ev.at });
      return;
    }
    c.g.remove();
    const s = ensureState(ev.key);
    if (!windowed()) {
      s.count++;
      showState(s); Lab.flash(s.g);
      if (mode.emit === "update") emit([{ key: ev.key, count: s.count, timeText: t8(ev.at) }], ev.at);
      return;
    }
    const ws = Math.floor(ev.et / WIN) * WIN;
    s.wins.set(ws, (s.wins.get(ws) || 0) + 1);
    showState(s); Lab.flash(s.g);
    if (wm == null || ev.wm > wm) { wm = ev.wm; closeWindows(ev.at); }
  }

  /* A window is final once its end is at or before the watermark: emit it once, then free its state. */
  function closeWindows(T) {
    const closed = new Map();   // window start -> rows
    KEYS.forEach((key) => {
      const s = state.get(key);
      if (!s) return;
      [...s.wins.keys()].forEach((ws) => {
        if (ws + WIN > wm) return;
        if (!closed.has(ws)) closed.set(ws, []);
        closed.get(ws).push({ key, count: s.wins.get(ws) });
        s.wins.delete(ws);
      });
      if (s.wins.size) showState(s); else { s.g.remove(); state.delete(key); }
    });
    const rows = [...closed.keys()].sort((a, b) => a - b)
      .flatMap((ws) => closed.get(ws).map((r) => ({ ...r, timeText: `${t8(ws)}–:${t8(ws + WIN).slice(6)}` })));
    if (rows.length) emit(rows, T);
  }

  function step(now) {
    while (nextAt < now + AHEAD) {
      const ev = newEvent(nextAt);
      inputs.push({ ev, g: Lab.card(L.in, ev) });
      nextAt += rnd() < 0.55 ? MIN_GAP + rnd() * 0.25 : 1.7 + rnd() * 2.0;
    }
    for (;;) {   // everything due by now, in time order
      const te = inputs.length && inputs[0].ev.at <= now ? inputs[0].ev.at : Infinity;
      const tt = mode.emit === "periodic" && nextTick <= now ? nextTick : Infinity;
      if (te === Infinity && tt === Infinity) break;
      if (tt <= te) {
        const rows = KEYS.filter((k) => state.has(k)).map((k) => ({ key: k, count: state.get(k).count, timeText: t8(tt) }));
        if (rows.length) emit(rows, tt);
        nextTick += PERIOD;
      } else arrive(inputs.shift());
    }
    outs = outs.filter((o) => { const gone = OP.cx + V * (now - o.T) > W + CW; if (gone) o.g.remove(); return !gone; });
    drops = drops.filter((d) => { const gone = now - d.at > 1.2; if (gone) d.g.remove(); return !gone; });
  }

  function tick(dt, now) { step(now); render(now); }

  function render(now) {
    clockTxt.text(t8(now));
    opBox.classed("busy", now - lastArrive < 0.35);
    inputs.forEach((c) => {
      const dt = c.ev.at - now;
      let y = IN_Y, op = 1, sc = 1;
      if (!c.ev.late && dt < ROUTE) {     // turn toward the key's row and shrink into the state card
        const u = 1 - dt / ROUTE, e = u * u * (3 - 2 * u);
        y = IN_Y + (ROW[c.ev.key] - IN_Y) * e;
        sc = 1 - 0.72 * e;
        op = Math.min(1, dt / 0.2);
      }
      c.g.attr("transform", `translate(${OP.cx - V * dt},${y}) scale(${sc})`).style("opacity", op);
    });
    outs.forEach((o) => {               // come out of the key's state card, then merge into the one output line
      const u = Math.min(1, (now - o.T) / GROW), e = u * u * (3 - 2 * u);
      o.g.attr("transform", `translate(${OP.cx + V * (now - o.T)},${o.y0 + (IN_Y - o.y0) * e}) scale(${0.28 + 0.72 * e})`).style("display", now < o.T ? "none" : null).style("opacity", Math.min(1, (now - o.T) / 0.15));
    });
    drops.forEach((d) => {
      const t = Math.max(0, now - d.at - 0.25);
      d.g.attr("transform", `translate(${OP.cx + V * Math.min(now - d.at, 0.25)},${IN_Y + 70 * t + 130 * t * t})`).style("opacity", Math.max(0, 1 - t / 0.8));
    });
    // time axis; in windowed modes the window boundaries are drawn up through the stage
    const every = windowed() ? WIN : 2;
    const t0 = Math.ceil(now - (W - OP.cx) / V), t1 = Math.floor(now + OP.cx / V);
    const sel = L.axis.selectAll("g.tk").data(d3.range(t0, t1 + 1), (d) => d);
    const en = sel.enter().append("g").attr("class", "tk");
    en.append("line").attr("y1", 0).attr("y2", 6);
    en.each(function (d) {
      if (((d % every) + every) % every !== 0) return;
      const g = d3.select(this);
      g.append("text").attr("y", 19).text(t8(d));
      if (windowed()) g.append("line").attr("class", "wline").attr("y1", OP.y - AXIS_Y).attr("y2", 0);
    });
    sel.exit().remove();
    sel.merge(en).attr("transform", (d) => `translate(${OP.cx + V * (now - d)},${AXIS_Y})`);
    // watermark
    if (wm != null) {
      // the label stays readable near the right edge; past the edge the line is gone and the label points to it
      const x = OP.cx + V * (now - wm), off = x > W - 40;
      wmG.style("display", null);
      wmG.select("line").attr("x1", x).attr("x2", x).style("display", off ? "none" : null);
      wmG.select("text").attr("x", Math.min(x, W - 130)).text(`watermark ${t8(wm)}${off ? " →" : ""}`);
    }
  }

  const legend = [
    { key: "A", label: "device A" }, { key: "B", label: "device B" }, { key: "C", label: "device C" },
    { cls: "state", label: "hollow card = state" },
  ];
  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick, legend, focus: OP.cx / W }));
})();
