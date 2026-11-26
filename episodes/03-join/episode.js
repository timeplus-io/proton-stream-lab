/* Episode 3: streaming join. Same stage as episode 2, but two input streams feed one operator.
   Temperatures (rounded cards) ride the upper input line, humidity (square cards) the lower one.
   Each card turns onto its device's row and lands on that device's state card;
   a joined record grows out of the state card and stays on that row. */
(() => {
  const W = 1300, H = 404, V = 96;
  const { w: CW } = Lab.CARD;
  const KEYS = ["A", "B", "C"];
  const ROW = { A: 118, B: 202, C: 286 };
  const LINE = { L: 160, R: 244 };     // input lines: left stream above, right stream below
  const OP = { x: 288, y: 50, w: 264, h: 286, cx: 420 };
  const AXIS_Y = 358;
  const MIN_GAP = (CW + 14) / V;
  const AHEAD = (OP.cx + CW) / V;
  const TURN = 2.0;       // seconds before arrival when a card leaves its input line for its device's row
  const LAND = 1.0;       // seconds before arrival when it is on that row and starts to sink into the state card
  const GROW = 1.0;       // seconds an output takes to grow out of its state card
  const REFUSED = 0.75;   // size of a card that finds nothing to join with
  const SLOT = (CW + 8) / V;   // records emitted together on one row leave one card apart
  const RANGE = 5;        // date_diff_within(5s)
  const LIMIT = 20;       // buffered rows at which the unbounded join is aborted (stands in for join_max_buffered_bytes)
  const HOLD = 3;         // seconds the aborted query stays on screen before the demo starts over
  const t8 = (t) => Lab.hms(t).slice(0, 8);

  const SEL = "SELECT t.device, t.temperature, h.humidity FROM temps AS t ";
  const modes = [
    {
      id: "latest", label: "Latest", kind: "latest", rule: "ON device, latest humidity", pRight: 0.35, pair: 0, warm: 16,
      sql: SEL + "LATEST JOIN humidity AS h ON t.device = h.device",
      note: "A join reads two streams: temperatures on the upper line (rounded cards) and humidity on the lower line (square cards). Here only the <b>right</b> stream is remembered, one row per device, always the latest. A temperature card is not stored: it looks up its device's row and leaves at once as a joined record. A new humidity card only replaces the stored row and emits nothing.",
    },
    {
      id: "all", label: "Both sides", kind: "all", rule: "ON device, every row", pRight: 0.5, pair: 0.35, warm: 5,
      sql: SEL + "JOIN humidity AS h ON t.device = h.device",
      note: "A plain <code>JOIN</code> of two append streams works in both directions. Every row of both streams is stored, and each new row is joined with <i>all</i> stored rows of the other stream for its device, so one arrival can emit several records. Nothing is ever removed. Proton aborts the query once the buffered rows pass <code>join_max_buffered_bytes</code>; here that happens at 20 rows, and the demo starts over.",
    },
    {
      id: "range", label: "Within 5s", kind: "range", rule: "ON device, within 5s", pRight: 0.5, pair: 0.35, warm: 16,
      sql: SEL + "JOIN humidity AS h ON t.device = h.device AND date_diff_within(5s)",
      note: "A time bound stops the growth. Two rows match only if their times are at most 5 seconds apart. Once <i>both</i> streams have moved more than 5 seconds past a row it can never match again, so it is removed from the state (the number turns gold). The join's watermark is the slower of the two streams, so if one stream goes quiet, the cleanup waits for it.",
    },
  ];

  let svgRef, L, mode, rnd, seq, nextAt, prev, t0, halt, lastSeen, lastArrive, outFree;
  let inputs, outs, drops, state, clockTxt, opBox, ruleTxt;

  function newEvent(at) {
    let key, side;
    if (prev && rnd() < mode.pair) {          // a device often reports its other reading shortly after the first
      key = prev.key; side = prev.side === "L" ? "R" : "L";
    } else {
      key = KEYS[Math.floor(rnd() * 3)]; side = rnd() < mode.pRight ? "R" : "L";
    }
    const val = side === "L" ? 26 + Math.floor(rnd() * 13) : 35 + Math.floor(rnd() * 31);
    prev = { id: ++seq, key, side, keyLabel: `device ${key}`, val, valText: side === "L" ? `${val} °C` : `${val} %`, at, et: at };
    return prev;
  }

  function init(svg, m) { svgRef = svg; mode = m; t0 = 0; build(); }

  function build() {
    const svg = svgRef;
    svg.selectAll("*").interrupt().remove();
    rnd = Lab.rng(7); seq = 0; prev = null; halt = null;
    inputs = []; outs = []; drops = []; state = new Map();
    lastSeen = { L: null, R: null }; lastArrive = -9; outFree = {};
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    L = {
      bg: svg.append("g"), axis: svg.append("g").attr("class", "axis"), box: svg.append("g"),
      out: svg.append("g"), state: svg.append("g"), in: svg.append("g"), top: svg.append("g"),
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
    ruleTxt = L.box.append("text").attr("class", "op-rule").attr("x", OP.cx).attr("y", OP.y + 22).text(mode.rule);

    // warm up, so the first frame already shows state and output
    nextAt = -mode.warm;
    for (let t = -mode.warm; t < 0; t += 0.1) step(t);
    step(0); render(0);
  }

  /* ----- operator logic ----- */
  function ensureState(key) {
    if (!state.has(key)) {
      const g = Lab.stateCard(L.state, key, `device ${key}`).attr("transform", `translate(${OP.cx},${ROW[key]})`);
      g.style("opacity", 0).transition().duration(250).style("opacity", 1);
      state.set(key, { g, L: [], R: [] });
    }
    return state.get(key);
  }
  function showState(s) {
    if (mode.kind === "latest") Lab.setState(s.g, [{ l: "humidity", r: `${s.R[0].val} %` }]);
    else Lab.setState(s.g, [{ l: "temps", r: s.L.length }, { l: "humidity", r: s.R.length }]);
  }
  const buffered = () => d3.sum([...state.values()], (s) => s.L.length + s.R.length);

  /* A joined record: left row + right row of the same device. Rounded on the left, square on the right. */
  const joined = (l, r) => ({ key: l.key, side: "J", title: `#${l.id} + #${r.id} · ${l.key}`, valText: `${l.val}° · ${r.val}%` });

  /* One card per joined record, on its device's row, at its emit time.
     Records emitted together on one row leave one after another. */
  function emit(rows, T) {
    rows.forEach((r) => {
      const at = Math.max(T, outFree[r.key] ?? -Infinity);
      outFree[r.key] = at + SLOT;
      const g = Lab.card(L.out, { ...r, timeText: t8(T) }).style("display", "none");
      outs.push({ g, T: at, y: ROW[r.key] });
    });
  }

  function arrive(c) {
    const ev = c.ev;
    lastArrive = ev.at;
    if (mode.kind === "latest") {
      if (ev.side === "R") {              // the right side is stored: one row per device, the latest wins
        c.g.remove();
        const s = ensureState(ev.key);
        s.R = [ev]; showState(s); Lab.flash(s.g, 0);
        return;
      }
      const s = state.get(ev.key);        // the left side only looks up
      if (!s) {                           // INNER join: no humidity row for this device yet, nothing is emitted
        L.top.node().appendChild(c.g.node());
        c.g.classed("dropped", true);
        drops.push({ g: c.g, at: ev.at, y: ROW[ev.key] });
        return;
      }
      c.g.remove(); Lab.flash(s.g);
      emit([joined(ev, s.R[0])], ev.at);
      return;
    }
    // both sides are stored; the new row is joined with the stored rows of the other stream
    c.g.remove();
    const s = ensureState(ev.key), other = ev.side === "L" ? "R" : "L";
    const matches = s[other].filter((r) => mode.kind !== "range" || ev.et - r.et <= RANGE);
    s[ev.side].push(ev);
    showState(s); Lab.flash(s.g, ev.side === "L" ? 0 : 1);
    emit(matches.map((r) => (ev.side === "L" ? joined(ev, r) : joined(r, ev))), ev.at);
    if (mode.kind === "range") { lastSeen[ev.side] = ev.et; evict(); }
    if (mode.kind === "all" && buffered() >= LIMIT) halt = ev.at;
  }

  /* Range join cleanup. The join's watermark is the slower of the two streams (MemoryHashJoin::calculateWatermark);
     rows more than RANGE behind it can never match again and are removed (removeOldBuckets). */
  function evict() {
    if (lastSeen.L == null || lastSeen.R == null) return;
    const horizon = Math.min(lastSeen.L, lastSeen.R) - RANGE;
    state.forEach((s, key) => {
      ["L", "R"].forEach((side, i) => {
        const keep = s[side].filter((r) => r.et >= horizon);
        if (keep.length === s[side].length) return;
        s[side] = keep; showState(s); Lab.mark(s.g, i, "var(--wm)");
      });
      if (!s.L.length && !s.R.length) {
        s.g.transition().delay(350).duration(250).style("opacity", 0).remove();
        state.delete(key);
      }
    });
  }

  function step(now) {
    while (nextAt < now + AHEAD) {
      const ev = newEvent(nextAt);
      inputs.push({ ev, g: Lab.card(L.in, ev) });
      nextAt += rnd() < 0.55 ? MIN_GAP + rnd() * 0.25 : 1.7 + rnd() * 2.0;
    }
    while (halt == null && inputs.length && inputs[0].ev.at <= now) arrive(inputs.shift());
    outs = outs.filter((o) => { const gone = OP.cx + V * (now - o.T) > W + CW; if (gone) o.g.remove(); return !gone; });
    drops = drops.filter((d) => { const gone = now - d.at > 1.3; if (gone) d.g.remove(); return !gone; });
  }

  function tick(dt, now) {
    const t = now - t0;
    if (halt != null) {                   // the aborted query stays on screen for a moment, then the demo starts over
      if (t - halt > HOLD) { t0 = now; build(); }
      return;
    }
    step(t); render(t);
    if (halt != null) {
      opBox.classed("failed", true);
      ruleTxt.classed("failed", true).text("memory limit: query aborted");
    }
  }

  function render(now) {
    clockTxt.text(t8(now));
    opBox.classed("busy", now - lastArrive < 0.35);
    // Input: ride the stream's line, turn onto the device's row at the operator's edge, then land on the state card and sink into it.
    inputs.forEach((c) => {
      const dt = c.ev.at - now, y0 = LINE[c.ev.side];
      let y = y0, op = 1, sc = 1;
      if (dt < TURN) { const u = Math.min(1, (TURN - dt) / (TURN - LAND)); y = y0 + (ROW[c.ev.key] - y0) * u * u * (3 - 2 * u); }
      if (dt < LAND) { const u = 1 - dt / LAND; sc = 1 - 0.6 * u * u; op = Math.min(1, dt / 0.5); }
      c.g.attr("transform", `translate(${OP.cx - V * dt},${y}) scale(${sc})`).style("opacity", op);
    });
    // Output, the mirror image: grow out of the device's state card and ride that device's row.
    outs.forEach((o) => {
      const a = now - o.T, u = Math.min(1, Math.max(0, a / GROW));
      o.g.attr("transform", `translate(${OP.cx + V * a},${o.y}) scale(${0.4 + 0.6 * u * (2 - u)})`).style("display", a < 0 ? "none" : null).style("opacity", Math.min(1, a / 0.3));
    });
    drops.forEach((d) => {
      const t = Math.max(0, now - d.at - 0.3);   // turn grey where it landed, then fall away
      d.g.attr("transform", `translate(${OP.cx},${d.y + 50 * t + 100 * t * t}) scale(${REFUSED})`).style("opacity", Math.max(0, 1 - t / 0.8));
    });
    // time axis: one tick per second, scrolling with the cards
    const t0x = Math.ceil(now - (W - OP.cx) / V), t1x = Math.floor(now + OP.cx / V);
    const sel = L.axis.selectAll("g.tk").data(d3.range(t0x, t1x + 1), (d) => d);
    const en = sel.enter().append("g").attr("class", "tk");
    en.append("line").attr("y1", 0).attr("y2", 6);
    en.append("text").attr("y", 19).text((d) => (d % 2 === 0 ? t8(d) : ""));
    sel.exit().remove();
    sel.merge(en).attr("transform", (d) => `translate(${OP.cx + V * (now - d)},${AXIS_Y})`);
  }

  const legend = [
    { key: "A", label: "device A" }, { key: "B", label: "device B" }, { key: "C", label: "device C" },
    { cls: "round", label: "rounded = temps" }, { cls: "square", label: "square = humidity" },
    { cls: "state", label: "hollow = state" },
  ];
  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick, legend, focus: OP.cx / W }));
})();
