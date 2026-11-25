/* Episode 1: stateless transformation. Input on the left, the operator in the middle, output on the right.
   Events are generated forever; each card carries all of its data. */
(() => {
  const W = 1200, LANE_Y = 136;
  const OP = { x: 468, y: 50, w: 264, h: 142, cx: 600 };
  const AXIS_Y = 214;
  const { w: CW } = Lab.CARD;
  const V = 150;                         // px per second of processing time
  const MIN_GAP = (CW + 14) / V;         // closest two events can be without their cards overlapping
  const AHEAD = (OP.cx + CW) / V;        // how far into the future the input lane shows
  const DEVICES = ["A", "B", "C"];

  const modes = [
    {
      id: "pass", label: "Pass through", rule: "no change",
      sql: "SELECT * FROM sensors",
      note: "Each card sits on the time axis at its own timestamp, and reaches the operator exactly when the clock shows that time. Events come when they come, so the gaps are uneven: bursts, then quiet. By default an event's time (<code>_tp_time</code>) is the moment Timeplus ingests it.",
    },
    {
      id: "filter", label: "Filter", filter: true, rule: "temperature > 30",
      sql: "SELECT * FROM sensors WHERE temperature > 30",
      note: "Each event is checked on its own. Readings of 30 °C or less turn grey and drop out; the rest move on unchanged. Nothing is remembered between events, so a filter has no state.",
    },
    {
      id: "map", label: "Map", map: true, rule: "°C × 1.8 + 32 = °F",
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors",
      note: "One event in, one event out. The value is computed from the input (Celsius to Fahrenheit); the id, device and event time stay the same.",
    },
    {
      id: "both", label: "Filter + map", filter: true, map: true, rule: "> 30, then × 1.8 + 32",
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors WHERE temperature > 30",
      note: "Operators chain: the filter drops cold readings, the expression converts what is left. Both are stateless, so the query can restart from any point in the stream with nothing to restore.",
    },
  ];

  let L, cards, opBox, nextAt, seq, rnd, mode, clockTxt;

  function newEvent(now) {   // _tp_time defaults to the time the event is ingested
    const key = DEVICES[Math.floor(rnd() * 3)];
    const c = 26 + Math.floor(rnd() * 13);
    return { id: ++seq, key, keyLabel: `device ${key}`, val: c, valText: `${c} °C`, at: now, et: now };
  }

  function init(svg, m) {
    mode = m; cards = []; seq = 0; rnd = Lab.rng(42);
    L = { bg: svg.append("g"), axis: svg.append("g").attr("class", "axis"), cards: svg.append("g"), top: svg.append("g") };

    // the clock is the "now" marker: it sits above the operator, on the same vertical as the axis pointer
    clockTxt = L.bg.append("text").attr("class", "clock").attr("x", OP.cx).attr("y", 34);

    // cards fade in and out at the stage edges
    const defs = svg.append("defs");
    [["fadeL", 0, 1], ["fadeR", 1, 0]].forEach(([id, a, b]) => {
      const gr = defs.append("linearGradient").attr("id", id);
      gr.append("stop").attr("offset", 0).attr("class", `fade-stop-${a}`);
      gr.append("stop").attr("offset", 1).attr("class", `fade-stop-${b}`);
    });
    L.top.append("rect").attr("x", 0).attr("y", OP.y).attr("width", 70).attr("height", AXIS_Y + 30 - OP.y).attr("fill", "url(#fadeL)");
    L.top.append("rect").attr("x", W - 70).attr("y", OP.y).attr("width", 70).attr("height", AXIS_Y + 30 - OP.y).attr("fill", "url(#fadeR)");

    // time axis
    L.bg.append("line").attr("class", "axis-line").attr("x1", 0).attr("x2", W).attr("y1", AXIS_Y).attr("y2", AXIS_Y);
    L.top.append("path").attr("class", "now-mark").attr("d", `M${OP.cx},${AXIS_Y - 1} l-6,-9 h12 z`);

    // operator: a frame and its rule, nothing else
    opBox = L.bg.append("rect").attr("class", "op").attr("x", OP.x).attr("y", OP.y).attr("width", OP.w).attr("height", OP.h).attr("rx", 16);
    L.bg.append("text").attr("class", "op-rule").attr("x", OP.cx).attr("y", OP.y + 27).text(m.rule);

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
    c.done = true;
    if (mode.filter) {
      const ok = c.ev.val > 30;
      if (!ok) { c.dropAt = c.ev.at + (quiet ? -99 : 0.25); c.g.classed("dropped", true); return; }
    }
    if (mode.map) {
      c.ev.valText = `${Math.round((c.ev.val * 1.8 + 32) * 10) / 10} °F`;
      Lab.fill(c.g, c.ev);
      if (!quiet) Lab.flash(c.g);
    }
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
        c.x = OP.cx + V * Math.min(now - c.ev.at, 0.25);
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
    clockTxt.text(Lab.hms(now).slice(0, 8));
    opBox.classed("busy", cards.some((c) => c.dropAt == null && Math.abs(c.x - OP.cx) < OP.w / 2));
    cards.forEach((c) => c.g.attr("transform", `translate(${c.x},${LANE_Y + c.dy})`).style("opacity", c.op));
    // time axis: one tick per second, scrolling with the cards
    const t0 = Math.ceil(now - (W - OP.cx) / V), t1 = Math.floor(now + OP.cx / V);
    const ts = d3.range(t0, t1 + 1);
    const sel = L.axis.selectAll("g.tk").data(ts, (d) => d);
    const en = sel.enter().append("g").attr("class", "tk");
    en.append("line").attr("y1", 0).attr("y2", 6);
    en.append("text").attr("y", 19).text((d) => (d % 2 === 0 ? Lab.hms(d).slice(0, 8) : ""));
    sel.exit().remove();
    sel.merge(en).attr("transform", (d) => `translate(${OP.cx + V * (now - d)},${AXIS_Y})`);
  }

  const legend = [
    { key: "A", label: "device A" }, { key: "B", label: "device B" }, { key: "C", label: "device C" },
  ];
  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick, legend }));
})();
