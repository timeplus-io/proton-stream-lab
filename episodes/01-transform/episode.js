/* Episode 1: stateless transformation. Input on the left, the operator in the middle, output on the right.
   Events are generated forever; each card carries all of its data. */
(() => {
  const W = 1200, LANE_Y = 160;
  const OP = { x: 470, y: 70, w: 260, h: 180, cx: 600 };
  const { w: CW } = Lab.CARD;
  const V = 150;                         // px per second of processing time
  const GAP = CW + 14;
  const STOP = OP.x - CW / 2 - 12;       // where a card waits while the operator is busy
  const SPAWN_X = -CW / 2 - 8;
  const DEVICES = ["A", "B", "C"];

  const modes = [
    {
      id: "pass", label: "Pass through", P: 0.35,
      sql: "SELECT * FROM sensors",
      note: "Every event goes straight through. The time on each card is its <b>event time</b> (when the reading was taken); the clock above is <b>processing time</b> (when Proton handles it). They differ, and events can arrive out of order.",
    },
    {
      id: "filter", label: "Filter", P: 0.6, filter: true,
      sql: "SELECT * FROM sensors WHERE temperature > 30",
      note: "Each event is checked on its own. Readings of 30 °C or less turn grey and drop out; the rest move on unchanged. Nothing is remembered between events, so a filter has no state.",
    },
    {
      id: "map", label: "Map", P: 0.7, map: true,
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors",
      note: "One event in, one event out. The value is computed from the input (Celsius to Fahrenheit); the id, device and event time stay the same.",
    },
    {
      id: "both", label: "Filter + map", P: 1.0, filter: true, map: true,
      sql: "SELECT device, temperature * 1.8 + 32 AS temp_f, _tp_time FROM sensors WHERE temperature > 30",
      note: "Operators chain: the filter drops cold readings, the expression converts what is left. Both are stateless, so the query can restart from any point in the stream with nothing to restore.",
    },
  ];

  let L, cards, opCard, nextSpawn, seq, rnd, mode, stats, clockTxt, counters;

  function newEvent(now) {
    const key = DEVICES[Math.floor(rnd() * 3)];
    const c = 22 + Math.floor(rnd() * 17);
    return { id: ++seq, key, keyLabel: `dev ${key}`, val: c, valText: `${c} °C`, et: now - (0.3 + rnd() * 2.4) };
  }

  function init(svg, m) {
    mode = m; cards = []; opCard = null; seq = 0; rnd = Lab.rng(42); stats = { in: 0, out: 0, drop: 0 };
    L = { bg: svg.append("g"), cards: svg.append("g") };

    // clock
    L.bg.append("text").attr("class", "clock-lbl").attr("x", W / 2).attr("y", 30).text("processing time");
    clockTxt = L.bg.append("text").attr("class", "clock").attr("x", W / 2).attr("y", 52);

    // zones
    L.bg.append("rect").attr("class", "lane").attr("x", 0).attr("y", LANE_Y - 50).attr("width", OP.x - 16).attr("height", 100).attr("rx", 0);
    L.bg.append("rect").attr("class", "lane").attr("x", OP.x + OP.w + 16).attr("y", LANE_Y - 50).attr("width", W - OP.x - OP.w - 16).attr("height", 100);
    L.bg.append("text").attr("class", "zone-title").attr("x", 24).attr("y", LANE_Y - 64).text("INPUT · sensors stream");
    L.bg.append("text").attr("class", "zone-title").attr("x", OP.x + OP.w + 40).attr("y", LANE_Y - 64).text("OUTPUT");
    counters = {
      in: L.bg.append("text").attr("class", "count").attr("x", 24).attr("y", LANE_Y + 76),
      out: L.bg.append("text").attr("class", "count").attr("x", OP.x + OP.w + 40).attr("y", LANE_Y + 76),
      drop: L.bg.append("text").attr("class", "count").attr("x", OP.cx).attr("y", 344).attr("text-anchor", "middle"),
    };

    // operator
    L.bg.append("rect").attr("class", "op").attr("x", OP.x).attr("y", OP.y).attr("width", OP.w).attr("height", OP.h).attr("rx", 14);
    const title = m.filter && m.map ? "Filter → Expression" : m.filter ? "Filter" : m.map ? "Expression" : "Pass through";
    L.bg.append("text").attr("class", "op-title").attr("x", OP.cx).attr("y", OP.y + 26).text(title);
    const subs = [];
    if (m.filter) subs.push("temperature > 30");
    if (m.map) subs.push("temp_f = temp × 1.8 + 32");
    if (!subs.length) subs.push("no change");
    subs.forEach((s, i) => L.bg.append("text").attr("class", "op-sub").attr("x", OP.cx).attr("y", OP.y + OP.h - 30 + i * 18 - (subs.length - 1) * 9).text(s));

    // start with a few events already on the way, so the first frame is never empty
    nextSpawn = 0.4;
    [STOP - 2 * GAP, STOP - GAP, STOP].forEach((x, i) => {
      const ev = newEvent(-0.8 + i * 0.3);
      addCard(ev, x);
    });
    render(0);
  }

  function addCard(ev, x) {
    const g = Lab.card(L.cards, ev);
    const c = { ev, g, x, y: LANE_Y, stage: "in", t: 0, op: 1 };
    cards.push(c);
    stats.in++;
    return c;
  }

  function tick(dt, now) {
    // spawn new events forever
    if (now >= nextSpawn) {
      const lane = cards.filter((c) => c.stage === "in");
      const lastX = lane.length ? Math.min(...lane.map((c) => c.x)) : Infinity;
      if (lastX - SPAWN_X >= GAP) { addCard(newEvent(now), SPAWN_X); nextSpawn = now + 0.7 + rnd() * 0.8; }
    }
    // input lane: move right, queue behind the card ahead
    const lane = cards.filter((c) => c.stage === "in").sort((a, b) => b.x - a.x);
    lane.forEach((c, i) => {
      const limit = i === 0 ? (opCard ? STOP : OP.cx) : Math.min(lane[i - 1].x - GAP, STOP);
      c.x = Math.min(c.x + V * dt, Math.max(c.x, limit));
      if (i === 0 && !opCard && c.x >= OP.cx - 0.5) { c.stage = "op"; c.t = 0; opCard = c; }
    });
    // operator
    if (opCard) {
      const c = opCard, P = mode.P;
      c.t += dt;
      if (mode.filter && !c.checked && c.t >= P * 0.4) {
        c.checked = true;
        if (!(c.ev.val > 30)) { c.stage = "drop"; c.t = 0; c.g.classed("dropped", true); opCard = null; stats.drop++; }
      }
      if (opCard && mode.map && !c.mapped && c.t >= P * 0.7) {
        c.mapped = true;
        c.ev.valText = `${Math.round((c.ev.val * 1.8 + 32) * 10) / 10} °F`;
        Lab.fill(c.g, c.ev); Lab.flash(c.g);
      }
      if (opCard && c.t >= P) { c.stage = "out"; opCard = null; stats.out++; }
    }
    // output lane and dropped cards
    cards.forEach((c) => {
      if (c.stage === "out") c.x += V * 1.15 * dt;
      if (c.stage === "drop") { c.t += dt; c.y += 150 * dt; c.op = Math.max(0, 1 - c.t / 1.1); }
    });
    cards = cards.filter((c) => {
      const gone = (c.stage === "out" && c.x > W + CW) || (c.stage === "drop" && c.op <= 0);
      if (gone) c.g.remove();
      return !gone;
    });
    render(now);
  }

  function render(now) {
    clockTxt.text(Lab.hms(now));
    counters.in.text(`read ${stats.in}`);
    counters.out.text(`emitted ${stats.out}`);
    counters.drop.text(mode.filter ? `dropped ${stats.drop}` : "");
    cards.forEach((c) => c.g.attr("transform", `translate(${c.x},${c.y})`).style("opacity", c.op));
  }

  window.addEventListener("DOMContentLoaded", () => Lab.start({ modes, init, tick }));
})();
