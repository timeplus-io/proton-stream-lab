/* Episode 1: stateless transformation. Input on the left, the operator in the middle, output on the right.
   Events are generated forever; each card carries all of its data. */
(() => {
  const W = 1200, LANE_Y = 192, LANE_H = 108;
  const OP = { x: 468, y: 62, w: 264, h: 190, cx: 600 };
  const AXIS_Y = LANE_Y + LANE_H / 2 + 22;
  const { w: CW } = Lab.CARD;
  const V = 150;                         // px per second of processing time
  const MIN_GAP = (CW + 14) / V;         // closest two events can be without their cards overlapping
  const AHEAD = (OP.cx + CW) / V;        // how far into the future the input lane shows
  const DEVICES = ["A", "B", "C"];

  const modes = [
    {
      id: "pass", label: "Pass through",
      sql: "SELECT * FROM sensors",
      note: "Each card sits on the time axis at its own timestamp, and reaches the operator exactly when the clock shows that time. Events come when they come, so the gaps are uneven: bursts, then quiet. By default an event's time (<code>_tp_time</code>) is the moment Timeplus ingests it.",
    },
    {
      id: "filter", label: "Filter", filter: true,
      sql: "SELECT * FROM sensors WHERE temperature > 30",
      note: "Each event is checked on its own. Readings of 30 °C or less turn grey and drop out; the rest move on unchanged. Nothing is remembered between events, so a filter has no state.",
    },
    {
      id: "map", label: "Map", map: true,
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors",
      note: "One event in, one event out. The value is computed from the input (Celsius to Fahrenheit); the id, device and event time stay the same.",
    },
    {
      id: "both", label: "Filter + map", filter: true, map: true,
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors WHERE temperature > 30",
      note: "Operators chain: the filter drops cold readings, the expression converts what is left. Both are stateless, so the query can restart from any point in the stream with nothing to restore.",
    },
  ];

  let L, cards, opBox, nextAt, seq, rnd, mode, stats, clockTxt, counters;

  function newEvent(now) {   // _tp_time defaults to the time the event is ingested
    const key = DEVICES[Math.floor(rnd() * 3)];
    const c = 26 + Math.floor(rnd() * 13);
    return { id: ++seq, key, keyLabel: `dev ${key}`, val: c, valText: `${c} °C`, at: now, et: now };
  }

  function init(svg, m) {
    mode = m; cards = []; seq = 0; rnd = Lab.rng(42); stats = { in: 0, out: 0, drop: 0 };
    L = { bg: svg.append("g"), axis: svg.append("g").attr("class", "axis"), cards: svg.append("g"), top: svg.append("g") };

    // clock
    L.bg.append("text").attr("class", "clock-lbl").attr("x", W / 2).attr("y", 24).text("now");
    clockTxt = L.bg.append("text").attr("class", "clock").attr("x", W / 2).attr("y", 44);

    // lanes: input on the left, output on the right, both fading at the stage edge
    const defs = svg.append("defs");
    [["fadeL", 0, 1], ["fadeR", 1, 0]].forEach(([id, a, b]) => {
      const gr = defs.append("linearGradient").attr("id", id);
      gr.append("stop").attr("offset", 0).attr("class", `fade-stop-${a}`);
      gr.append("stop").attr("offset", 1).attr("class", `fade-stop-${b}`);
    });
    const top = LANE_Y - LANE_H / 2, outX = OP.x + OP.w + 14;
    L.bg.append("rect").attr("class", "lane").attr("x", -20).attr("y", top).attr("width", OP.x - 14 + 20).attr("height", LANE_H).attr("rx", 14);
    L.bg.append("rect").attr("class", "lane").attr("x", outX).attr("y", top).attr("width", W - outX + 20).attr("height", LANE_H).attr("rx", 14);
    L.bg.append("line").attr("class", "lane-line").attr("x1", 0).attr("x2", OP.x - 28).attr("y1", LANE_Y).attr("y2", LANE_Y);
    L.bg.append("line").attr("class", "lane-line").attr("x1", outX + 14).attr("x2", W).attr("y1", LANE_Y).attr("y2", LANE_Y);
    L.top.append("rect").attr("x", 0).attr("y", top - 6).attr("width", 70).attr("height", LANE_H + 56).attr("fill", "url(#fadeL)");
    L.top.append("rect").attr("x", W - 70).attr("y", top - 6).attr("width", 70).attr("height", LANE_H + 56).attr("fill", "url(#fadeR)");
    // time axis with a "now" marker under the operator
    L.bg.append("line").attr("class", "axis-line").attr("x1", 0).attr("x2", W).attr("y1", AXIS_Y).attr("y2", AXIS_Y);
    L.top.append("path").attr("class", "now-mark").attr("d", `M${OP.cx},${AXIS_Y - 1} l-6,-9 h12 z`);
    L.top.append("line").attr("class", "now-line").attr("x1", OP.cx).attr("x2", OP.cx).attr("y1", 52).attr("y2", OP.y);
    L.bg.append("text").attr("class", "zone-title").attr("x", 28).attr("y", top - 14).html("Input · <tspan>sensors</tspan>");
    L.bg.append("text").attr("class", "zone-title").attr("x", outX + 16).attr("y", top - 14).html("Output · <tspan>query result</tspan>");
    counters = {
      in: L.bg.append("text").attr("class", "count").attr("x", OP.x - 30).attr("y", top - 14).attr("text-anchor", "end"),
      out: L.bg.append("text").attr("class", "count").attr("x", W - 28).attr("y", top - 14).attr("text-anchor", "end"),
      drop: L.bg.append("text").attr("class", "count").attr("x", OP.cx).attr("y", 340).attr("text-anchor", "middle"),
    };

    // operator
    opBox = L.bg.append("rect").attr("class", "op").attr("x", OP.x).attr("y", OP.y).attr("width", OP.w).attr("height", OP.h).attr("rx", 16);
    const title = m.filter && m.map ? "Filter, then expression" : m.filter ? "Filter" : m.map ? "Expression" : "Pass through";
    L.bg.append("text").attr("class", "op-title").attr("x", OP.cx).attr("y", OP.y + 30).text(title);
    const rules = [];
    if (m.filter) rules.push("temperature > 30");
    if (m.map) rules.push("°F = °C × 1.8 + 32");
    if (!rules.length) rules.push("no change");
    const ry = OP.y + 54;
    rules.forEach((r, i) => {
      const w = r.length * 7.3 + 22;
      const g = L.bg.append("g").attr("class", "rule").attr("transform", `translate(${OP.cx},${ry + i * 24})`);
      g.append("rect").attr("x", -w / 2).attr("y", -10).attr("width", w).attr("height", 20).attr("rx", 10);
      g.append("text").attr("y", 4).text(r);
    });

    // events already on the wire, placed by their timestamps
    nextAt = -(OP.cx + CW) / V;
    step(0);
    cards.forEach((c) => { if (c.ev.at < 0) apply(c, true); });
    render(0);
  }

  function addCard(ev) {
    cards.push({ ev, g: Lab.card(L.cards, ev), dy: 0, op: 1 });
  }

  /* What the operator does to one event, at the moment the clock reaches its timestamp. */
  function apply(c, quiet) {
    c.done = true; stats.in++;
    if (mode.filter) {
      const ok = c.ev.val > 30;
      if (!quiet) Lab.badge(c.g, ok, !ok);
      if (!ok) { c.dropAt = c.ev.at + (quiet ? -99 : 0.3); c.g.classed("dropped", true); stats.drop++; return; }
    }
    if (mode.map) {
      c.ev.valText = `${Math.round((c.ev.val * 1.8 + 32) * 10) / 10} °F`;
      Lab.fill(c.g, c.ev);
      if (!quiet) Lab.flash(c.g);
    }
    stats.out++;
  }

  /* Position is a pure function of time: a card is under the clock exactly when the clock shows its timestamp. */
  function step(now) {
    while (nextAt < now + AHEAD) {
      addCard(newEvent(nextAt));
      // uneven arrivals: short gaps inside a burst, long gaps between bursts
      nextAt += rnd() < 0.55 ? MIN_GAP + rnd() * 0.25 : 1.7 + rnd() * 2.0;
    }
    cards.forEach((c) => {
      if (!c.done && now >= c.ev.at) apply(c);
      if (c.dropAt != null) {
        const t = now - c.dropAt;
        c.x = OP.cx + V * Math.min(now - c.ev.at, 0.3);
        if (t > 0) { c.dy = 70 * t + 130 * t * t; c.op = Math.max(0, 1 - t / 0.8); }
      } else c.x = OP.cx + V * (now - c.ev.at);
    });
    cards = cards.filter((c) => {
      const gone = c.x > W + CW || c.op <= 0;
      if (gone) c.g.remove();
      return !gone;
    });
  }

  function tick(dt, now) { step(now); render(now); }

  function render(now) {
    clockTxt.text(Lab.hms(now).slice(0, 10));
    counters.in.html(`<tspan>${stats.in}</tspan> read`);
    counters.out.html(`<tspan>${stats.out}</tspan> emitted`);
    counters.drop.html(mode.filter ? `<tspan>${stats.drop}</tspan> dropped` : "");
    opBox.classed("busy", cards.some((c) => c.dropAt == null && Math.abs(c.x - OP.cx) < OP.w / 2));
    cards.forEach((c) => c.g.attr("transform", `translate(${c.x},${LANE_Y + c.dy})`).style("opacity", c.op));
    // time axis: one tick per second, scrolling with the cards
    const t0 = Math.ceil(now - (W - OP.cx) / V), t1 = Math.floor(now + OP.cx / V);
    const ts = d3.range(t0, t1 + 1);
    const sel = L.axis.selectAll("g.tk").data(ts, (d) => d);
    const en = sel.enter().append("g").attr("class", "tk");
    en.append("line").attr("y1", 0).attr("y2", 6);
    en.append("text").attr("y", 19).text((d) => Lab.hms(d).slice(0, 8));
    sel.exit().remove();
    sel.merge(en).attr("transform", (d) => `translate(${OP.cx + V * (now - d)},${AXIS_Y})`);
  }

  const legend = [
    { key: "A", label: "device A" }, { key: "B", label: "device B" }, { key: "C", label: "device C" },
    { cls: "dropped", label: "dropped" },
  ];
  const legendNote = "On each card: <b>#id</b>, <b>device</b>, <b>reading</b>, <b>event time</b>";
  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick, legend, legendNote }));
})();
