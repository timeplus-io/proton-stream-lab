/* Episode 3: streaming join. One operator, two inputs, and the two sides never share a lane.
   The left stream (rounded cards) arrives on the upper lane, the right side (square cards) on the lower lane.
   A side that is remembered has its own table inside the operator; a stored row is a small chip in that table.
   A side that is not remembered passes straight through and leaves as a joined record. */
(() => {
  const W = 1300, H = 422, V = 96;
  const { w: CW } = Lab.CARD;
  const KEYS = ["A", "B", "C"];
  const LANE = { L: 130, R: 286 };       // input lanes: left stream above, right side below
  const OUT_Y = 208;                     // joined records of a two-table join leave between the tables
  const OP = { x: 288, y: 50, w: 264, h: 304, cx: 420 };
  const AXIS_Y = 376;
  const TB = { w: 232, h: 96 };          // a table inside the operator
  const CHIP = { w: 98, h: 19, gap: 6, row: 22, cap: 2 };   // a stored row; cap = chips that fit in one device's row
  const FULL = CHIP.cap * KEYS.length;   // rows that fill one table
  const MIN_GAP = (CW + 14) / V;
  const AHEAD = (OP.cx + CW) / V;
  const LAND = 2.0;       // seconds before arrival when a card starts to shrink into its place in the table
  const GROW = 1.8;       // seconds a joined record takes to grow out from between the tables
  const FLY = 0.45;       // seconds a copy of a stored row takes to fly to the record it joins
  const LOOKUP = 0.7;     // seconds a looked-up row takes to reach the card that asked for it
  const SLOT = (CW + 8) / V;   // records emitted together leave one card apart
  const RANGE = 5;        // date_diff_within(5s)
  const DRAIN = 4.5;      // seconds between the row that fills the tables and the row that no longer fits
  const HOLD = 3;         // seconds the aborted query stays on screen before the demo starts over
  const t8 = (t) => Lab.hms(t).slice(0, 8);

  // arrival gaps of a stream: bursts and pauses, never closer than one card
  const GAP = {
    busy: (r) => (r() < 0.45 ? MIN_GAP + r() * 0.5 : 2.4 + r() * 3.2),
    mid: (r) => 3 + r() * 4,
    steady: (r) => 2.6 + r() * 2.6,
    slow: (r) => 4 + r() * 5,
  };
  const SEL = "SELECT t.device, t.temperature, h.humidity FROM temps AS t ";
  const ROOMS = [["A", "lab"], ["B", "roof"], ["C", "dock"]];   // the devices table: device, room
  const BOTH = { L: "temps stream", R: "humidity stream" };
  const modes = [
    {
      id: "table", label: "Stream + table", kind: "table", rule: "ON device, look up the table", warm: 8,
      gaps: { L: "busy" }, tables: { R: "devices table" }, lanes: { L: "temps stream" },
      sql: "SELECT t.device, t.temperature, d.room FROM temps AS t JOIN table(devices) AS d ON t.device = d.device",
      note: "A join adds columns from another source. The simplest case is a stream and a table. The table is read once when the query starts and stays inside the operator, one row per device. When a temperature card reaches the operator, the row of its device is looked up and added to the card, which leaves as the joined record. The stream itself is never stored, so the state stays as small as the table. Later changes to the table are not seen.",
    },
    {
      id: "all", label: "Stream + stream", kind: "all", rule: "ON device, keep every row", warm: 6,
      gaps: { L: "mid", R: "mid" }, tables: { L: "temps rows", R: "humidity rows" }, lanes: BOTH,
      sql: SEL + "JOIN humidity AS h ON t.device = h.device",
      note: "Now both sides are streams: temperatures (<code>t</code>) on the upper lane, humidity readings (<code>h</code>) on the lower lane, each at its own pace. A match can come from either side at any time, so the operator has to keep every row of both streams, each in its own table. A new row is joined with all rows of the same device in the other table. Nothing is ever removed, so the state only grows. Proton aborts the query when the buffered rows pass <code>join_max_buffered_bytes</code>; here the limit is what the two tables can hold. When both are full, the next row has no room: the query is aborted and the demo starts over.",
    },
    {
      id: "range", label: "Within 5s", kind: "range", rule: "ON device, rows up to 5s old", warm: 16, echo: 0.45,
      gaps: { L: "steady", R: "steady" }, tables: { L: "temps rows, by age", R: "humidity rows, by age" }, lanes: BOTH,
      sql: SEL + "JOIN humidity AS h ON t.device = h.device AND date_diff_within(5s)",
      note: "A time bound stops the growth, because rows are now kept by <b>age</b>. Every stored row shows how old it is. A new row can only match rows that are at most 5 seconds old, so a row older than that can never match again: it turns grey. A grey row is removed (gold outline, then gone) as soon as both streams have moved past it. If one stream goes quiet, the cleanup waits for it. The state stays small however long the query runs.",
    },
    {
      id: "latest", label: "Latest", kind: "latest", rule: "ON device, latest humidity", warm: 16,
      gaps: { L: "busy", R: "slow" }, tables: { R: "humidity, latest per device" }, lanes: BOTH,
      sql: SEL + "LATEST JOIN humidity AS h ON t.device = h.device",
      note: "Another way to keep the state small: remember only the newest humidity reading of each device. A new reading replaces the old one and emits nothing. A temperature card is not stored: it picks up the latest humidity of its device and leaves as the joined record, like the table lookup of the first tab, but against live data.",
    },
  ];
  const lookup = () => mode.kind === "table" || mode.kind === "latest";   // only the right side is stored

  let svgRef, L, mode, gen, lefts, t0, halt, clock, lastSeen, lastArrive, outFree, lastStored, overflow;
  let inputs, outs, drops, flies, tbl, clockTxt, opBox, ruleTxt, warming;

  function newEvent(side, at) {
    const g = gen[side], r = g.rnd;
    let key = KEYS[Math.floor(r() * 3)];
    if (side === "R" && mode.echo && r() < mode.echo) {   // a device often reports humidity shortly after a temperature
      const p = lefts.filter((e) => e.at < at).pop();
      if (p) key = p.key;
    }
    if (!lookup()) {                      // a device's row in a table holds CHIP.cap chips: keep the devices balanced
      const n = (k) => tbl[side][k].length + inputs.filter((c) => c.ev.side === side && c.ev.key === k).length;
      if (n(key) >= CHIP.cap - 1) key = KEYS.reduce((a, k) => (n(k) < n(a) ? k : a));
    }
    if (mode.kind === "range") {          // keep clear of the edge: a partner is either well inside the 5 seconds or well outside
      const other = side === "L" ? "R" : "L";
      const edge = (k) => [...tbl[other][k].map((x) => x.ev), ...inputs.filter((c) => c.ev.side === other && c.ev.key === k).map((c) => c.ev)]
        .some((e) => Math.abs(Math.abs(at - e.et) - RANGE) < 0.7);
      if (edge(key)) key = KEYS.find((k) => !edge(k)) ?? key;
    }
    const [lo, span] = side === "L" ? [26, 13] : [35, 31];
    let val = lo + Math.floor(r() * span);
    while (g.recent.includes(val)) val = lo + ((val - lo + 3) % span);   // rows on screen together never share a value
    g.recent.push(val); if (g.recent.length > 6) g.recent.shift();
    const tag = (side === "L" ? "t" : "h") + ++g.seq;
    const ev = { tag, key, side, title: `${tag} · device ${key}`, val, valText: side === "L" ? `${val} °C` : `${val} %`, at, et: at };
    if (side === "L") { lefts.push(ev); if (lefts.length > 8) lefts.shift(); }
    return ev;
  }

  function init(svg, m) { svgRef = svg; mode = m; t0 = 0; build(); }

  function build() {
    const svg = svgRef;
    svg.selectAll("*").interrupt().remove();
    halt = null; clock = 0; lefts = []; lastStored = -Infinity; overflow = false;
    inputs = []; outs = []; drops = []; flies = [];
    lastSeen = { L: null, R: null }; lastArrive = -9; outFree = -Infinity;
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
    ruleTxt = L.box.append("text").attr("class", "op-rule").attr("x", OP.cx).attr("y", OP.y + 20).text(mode.rule);

    Object.entries(mode.lanes).forEach(([side, name]) =>
      L.bg.append("text").attr("class", "lane").attr("x", 84).attr("y", LANE[side] - 46).text(name));

    // one table per remembered side, on that side's lane
    tbl = {};
    Object.entries(mode.tables).forEach(([side, title]) => {
      const g = L.state.append("g").attr("class", "tbox").attr("transform", `translate(${OP.cx},${LANE[side]})`);
      g.append("rect").attr("class", "body").attr("x", -TB.w / 2).attr("y", -TB.h / 2).attr("width", TB.w).attr("height", TB.h).attr("rx", 12);
      g.append("text").attr("class", "t-title").attr("x", -TB.w / 2 + 12).attr("y", -TB.h / 2 + 17).text(title);
      tbl[side] = { A: [], B: [], C: [] };
    });

    gen = {};
    Object.entries(mode.gaps).forEach(([side, kind], i) => {
      gen[side] = { rnd: Lab.rng(side === "L" ? 11 : 29), seq: 0, recent: [], next: -mode.warm + i * 0.7, gap: GAP[kind] };
    });
    // warm up, so the first frame already shows state and output
    warming = true;
    // the table was read when the query started: its rows are in the operator from the first frame
    if (mode.kind === "table") ROOMS.forEach(([key, room]) => store({ key, side: "R", val: room }));
    for (let t = -mode.warm; t < 0; t += 0.1) step(t);
    warming = false;
    step(0); render(0);
  }

  /* ----- tables and chips ----- */
  const chipPos = (side, key, i) => [
    OP.cx - (CHIP.cap * (CHIP.w + CHIP.gap) - CHIP.gap) / 2 + CHIP.w / 2 + i * (CHIP.w + CHIP.gap),
    LANE[side] - TB.h / 2 + 27 + KEYS.indexOf(key) * CHIP.row + CHIP.h / 2,
  ];
  const chipLabel = (ev) => (ev.tag ? `${ev.tag} · ${ev.val} ${ev.side === "L" ? "°C" : "%"}` : `${ev.key} · ${ev.val}`);
  /* aged = a stored row of the range join: its label moves to the left and its age is printed on the right. */
  function chip(layer, ev, [x, y], aged) {
    const g = layer.append("g").attr("class", "chip").attr("transform", `translate(${x},${y})`);
    g.append("rect").attr("x", -CHIP.w / 2).attr("y", -CHIP.h / 2).attr("width", CHIP.w).attr("height", CHIP.h)
      .attr("rx", ev.side === "R" ? 2 : 7).style("fill", Lab.keyColor(ev.key));
    const label = g.append("text").attr("y", 3.6).text(chipLabel(ev));
    if (aged) {
      label.attr("x", -CHIP.w / 2 + 8).style("text-anchor", "start").text(`${ev.tag} · ${ev.val}${ev.side === "L" ? "°" : "%"}`);
      g.append("text").attr("class", "age").attr("x", CHIP.w / 2 - 8).attr("y", 3.6).style("text-anchor", "end");
    }
    return g;
  }
  /* Range join: a stored row ages. It fades a little as it gets older and turns grey once it is too old to match. */
  function showAge(r, now) {
    const age = now - r.ev.et, old = age > RANGE;
    r.g.select(".age").text(`${Math.max(0, Math.floor(age))}s`);
    r.g.select("rect").style("fill", old ? "var(--late)" : Lab.keyColor(r.ev.key)).style("fill-opacity", old ? 1 : 1 - 0.35 * Math.min(1, age / RANGE));
  }
  const outline = (g, color) => g.select("rect").interrupt().style("stroke", color).style("stroke-width", 3);
  const flashChip = (g) => { if (!warming) outline(g, "var(--accent)").transition().duration(800).style("stroke-width", 0); };

  /* Remember a row: it becomes a chip in its side's table, in its device's row. */
  function store(ev, replace) {
    const rows = tbl[ev.side][ev.key];
    if (replace) rows.splice(0).forEach((r) => r.g.remove());
    const r = { ev, g: chip(L.state, ev, chipPos(ev.side, ev.key, rows.length), mode.kind === "range") };
    rows.push(r);
    flashChip(r.g);
    return r;
  }

  /* A copy of a stored row flies to the record it becomes part of. to() gives the target, which may be moving. */
  function fly(r, to, T, dur = FLY, fade = 0.6) {
    const from = chipPos(r.ev.side, r.ev.key, tbl[r.ev.side][r.ev.key].indexOf(r));
    const g = chip(L.top, r.ev, from);
    g.select("rect").style("stroke", "var(--panel)").style("stroke-width", 1.5);   // stays visible over a card of its own color
    flies.push({ g, from, to, T, dur, fade });
  }

  /* A joined record: left row + right row of the same device. Rounded on the left, square on the right. */
  const joined = (l, r) => (mode.kind === "table"
    ? { key: l.key, side: "J", title: `${l.tag} · device ${l.key}`, valText: `${l.val}° · ${r.val}` }
    : { key: l.key, side: "J", title: `${l.tag} + ${r.tag} · ${l.key}`, valText: `${l.val}° · ${r.val}%` });

  /* Two-table join output: one card per joined record, growing out from between the tables.
     Records emitted together leave one after another. */
  function emit(pairs, T) {
    pairs.forEach(([l, r]) => {
      const at = Math.max(T, outFree);
      outFree = at + SLOT;
      const g = Lab.card(L.out, { ...joined(l.ev, r.ev), timeText: t8(at) }).style("display", "none");
      outs.push({ g, T: at, y: OUT_Y, rows: [l, r] });
    });
  }

  /* The moment a record leaves: the two stored rows it is made of light up and a copy of each flies to it. */
  function pair(o) {
    o.rows.forEach((r) => {
      if (tbl[r.ev.side][r.ev.key].indexOf(r) < 0) return;   // already removed by the range cleanup
      flashChip(r.g);
      fly(r, () => [OP.cx + V * (clock - o.T), OUT_Y], o.T);
    });
    o.rows = null;
  }

  function arrive(c) {
    const ev = c.ev;
    lastArrive = ev.at;
    if (lookup()) {
      if (ev.side === "R") { c.g.remove(); store(ev, true); return; }   // one row per device; for a stream, the latest wins
      const r = tbl.R[ev.key][0];
      if (!r) {                           // INNER join: no right row for this device, nothing is emitted
        L.top.node().appendChild(c.g.node());
        c.g.classed("dropped", true);
        drops.push({ g: c.g, at: ev.at, y: LANE.L });
        return;
      }
      // The left row is not stored. It keeps moving on its own lane while its device's row is looked up:
      // a copy of that row leaves the table, and when it reaches the card the card becomes the joined record.
      L.top.node().appendChild(c.g.node());
      const o = { g: c.g, T: ev.at, y: LANE.L, through: true, lookup: { l: ev, r: r.ev, at: ev.at + LOOKUP } };
      outs.push(o);
      if (!warming) outline(r.g, "var(--accent)").transition().delay(LOOKUP * 1000).duration(400).style("stroke-width", 0);
      fly(r, () => [OP.cx + V * (clock - o.T), LANE.L], ev.at, LOOKUP, 0);
      return;
    }
    if (ev.over) {                        // both tables are full: this row has no room, and the query is aborted
      L.top.node().appendChild(c.g.node());
      c.g.classed("dropped", true);
      halt = ev.at;
      return;
    }
    // both sides are stored; the new row is joined with the rows of the same device in the other table
    c.g.remove();
    const other = ev.side === "L" ? "R" : "L";
    const matches = tbl[other][ev.key].filter((r) => mode.kind !== "range" || ev.et - r.ev.et <= RANGE);
    const mine = store(ev);
    emit(matches.map((r) => (ev.side === "L" ? [mine, r] : [r, mine])), ev.at);
    if (mode.kind === "range") { lastSeen[ev.side] = ev.et; evict(); }

  }

  /* Range join cleanup. The join's watermark is the slower of the two streams (MemoryHashJoin::calculateWatermark);
     rows more than RANGE behind it can never match again and are removed (removeOldBuckets). */
  function evict() {
    if (lastSeen.L == null || lastSeen.R == null) return;
    const horizon = Math.min(lastSeen.L, lastSeen.R) - RANGE;
    Object.entries(tbl).forEach(([side, t]) => KEYS.forEach((key) => {
      const gone = t[key].filter((r) => r.ev.et < horizon);
      if (!gone.length) return;
      t[key] = t[key].filter((r) => r.ev.et >= horizon);
      gone.forEach((r) => {
        if (warming) return r.g.remove();
        outline(r.g, "var(--wm)");
        r.g.transition().delay(350).duration(300).style("opacity", 0).on("end", () => r.g.remove());
      });
      t[key].forEach((r, i) => {          // the rows that stay close the gap
        const [x, y] = chipPos(side, key, i);
        if (warming) r.g.attr("transform", `translate(${x},${y})`);
        else r.g.transition("move").delay(500).duration(300).attr("transform", `translate(${x},${y})`);
      });
    }));
  }

  function step(now) {
    Object.entries(gen).forEach(([side, g]) => {
      while (g.next < now + AHEAD) {
        let over = false;
        if (mode.kind === "all" && g.seq >= FULL) {
          // This stream's table is full. It stays quiet until the other table is full too;
          // then one more row arrives, late enough that every record already joined has left.
          const other = gen[side === "L" ? "R" : "L"];
          if (overflow || other.seq < FULL) { g.next += g.gap(g.rnd); continue; }
          g.next = Math.max(g.next, lastStored + DRAIN);
          overflow = over = true;
        }
        const ev = newEvent(side, g.next);
        ev.over = over;
        if (!over) lastStored = Math.max(lastStored, ev.at);
        inputs.push({ ev, g: Lab.card(L.in, ev) });
        g.next += g.gap(g.rnd);
      }
    });
    inputs.sort((a, b) => a.ev.at - b.ev.at);
    while (halt == null && inputs.length && inputs[0].ev.at <= now) arrive(inputs.shift());
    outs.forEach((o) => {
      if (o.rows && o.T <= now) pair(o);
      if (o.lookup && o.lookup.at <= now) {       // the looked-up row has arrived: the card is now the joined record
        o.g.remove();
        o.g = Lab.card(L.top, { ...joined(o.lookup.l, o.lookup.r), timeText: t8(o.T) });
        if (!warming) Lab.flash(o.g);
        o.lookup = null;
      }
    });
    outs = outs.filter((o) => { const gone = OP.cx + V * (now - o.T) > W + CW; if (gone) o.g.remove(); return !gone; });
    drops = drops.filter((d) => { const gone = now - d.at > 1.3; if (gone) d.g.remove(); return !gone; });
    flies = flies.filter((f) => { const gone = now - f.T >= f.dur; if (gone) f.g.remove(); return !gone; });
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
    clock = now;
    clockTxt.text(t8(now));
    opBox.classed("busy", now - lastArrive < 0.35);
    // Input: ride the side's own lane. A row that will be stored shrinks into its place in that side's table.
    inputs.forEach((c) => {
      const ev = c.ev, dt = ev.at - now;
      let x = OP.cx - V * dt, y = LANE[ev.side], sc = 1;
      if (tbl[ev.side] && dt < LAND) {
        const u = 1 - dt / LAND, e = u * u * (3 - 2 * u);
        if (ev.over) x += (OP.cx - TB.w / 2 - CW / 2 - 8 - OP.cx) * e;   // no room: it stops at the table's edge
        else {
          const [tx, ty] = chipPos(ev.side, ev.key, lookup() ? 0 : tbl[ev.side][ev.key].length);
          x += (tx - OP.cx) * e; y += (ty - y) * e; sc = 1 - 0.5 * u * (2 - u);   // shrinks first, then glides in
        }
      }
      c.g.attr("transform", `translate(${x},${y}) scale(${sc})`);
    });
    // Output: a row that passed through keeps its lane; a record of a two-table join grows out from between the tables.
    outs.forEach((o) => {
      const a = now - o.T, u = Math.min(1, Math.max(0, a / GROW));
      const sc = o.through ? 1 : 0.4 + 0.6 * u * u;
      o.g.attr("transform", `translate(${OP.cx + V * a},${o.y}) scale(${sc})`).style("display", a < 0 ? "none" : null).style("opacity", o.through ? 1 : Math.min(1, a / 0.25));
    });
    if (mode.kind === "range") Object.values(tbl).forEach((t) => KEYS.forEach((k) => t[k].forEach((r) => showAge(r, now))));
    flies.forEach((f) => {
      const p = Math.min(1, Math.max(0, (now - f.T) / f.dur)), e = p * p * (3 - 2 * p), [tx, ty] = f.to();
      f.g.attr("transform", `translate(${f.from[0] + (tx - f.from[0]) * e},${f.from[1] + (ty - f.from[1]) * e})`).style("opacity", 1 - f.fade * p * p);
    });
    drops.forEach((d) => {
      const t = Math.max(0, now - d.at - 0.3);   // turn grey where it stood, then fall away
      d.g.attr("transform", `translate(${OP.cx},${d.y + 50 * t + 100 * t * t})`).style("opacity", Math.max(0, 1 - t / 0.8));
    });
    // time axis: one tick per second, scrolling with the cards
    const a0 = Math.ceil(now - (W - OP.cx) / V), a1 = Math.floor(now + OP.cx / V);
    const sel = L.axis.selectAll("g.tk").data(d3.range(a0, a1 + 1), (d) => d);
    const en = sel.enter().append("g").attr("class", "tk");
    en.append("line").attr("y1", 0).attr("y2", 6);
    en.append("text").attr("y", 19).text((d) => (d % 2 === 0 ? t8(d) : ""));
    sel.exit().remove();
    sel.merge(en).attr("transform", (d) => `translate(${OP.cx + V * (now - d)},${AXIS_Y})`);
  }

  const legend = [
    { key: "A", label: "device A" }, { key: "B", label: "device B" }, { key: "C", label: "device C" },
    { cls: "round", label: "left side" }, { cls: "square", label: "right side" }, { cls: "state", label: "state" },
  ];
  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick, legend, focus: OP.cx / W }));
})();
