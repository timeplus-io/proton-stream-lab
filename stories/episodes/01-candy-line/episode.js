/* Story 01, The candy line.
   A stream is a line that never ends, an event is one candy, an operator is a worker on the line.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const X1 = 10.6, BY = 3.9, WY = 2.95;   // the line ends at X1 and runs along y = BY; workers stand at y = WY, just behind it
  const HOLD = 0.8, LIFT = 0.42;          // how long a worker has a candy in hand, and how high it is lifted
  const CLOCK = [5.9, 2.85, 0.6];

  const SCENES = [
    { id: "line", label: "The line", stations: [{ kind: "watch", x: 5.2 }],
      story: "A stream is like this candy line. It has no last candy. Each one rolls out of the kitchen at its own moment, and the clock on the wall keeps the time. Nobody waits for the batch to be finished, because it never is." },
    { id: "inspector", label: "The inspector", stations: [{ kind: "filter", x: 5.2 }],
      story: "A worker on the line picks up one candy at a time and decides on the spot. Big enough goes back on the line. Too small goes in the bin. The worker needs no memory of the candies before. Engineers call this a filter." },
    { id: "wrapper", label: "The wrapper", stations: [{ kind: "wrap", x: 5.2 }],
      story: "This worker changes every candy. One raw candy comes in, one wrapped candy goes out, and the line never stops for it. Engineers call this a transform." },
    { id: "both", label: "The whole line", stations: [{ kind: "filter", x: 3.4 }, { kind: "wrap", x: 7.4 }],
      story: "Workers stand in a row and each one does a small job. Raw candy goes in on the left and finished candy comes out on the right, a moment after it arrived. That is stream processing: the work happens while things move." },
  ];

  let k, F, P, U, rnd, sc, L, line, ship, hands, items, stations, nextBorn, smallRun, lastFlavor, counts;

  function station(def, i) {
    const PAL = k.PAL, look = { watch: 0, filter: 1, wrap: 2 }[def.kind], coat = { watch: PAL.green, filter: PAL.blue, wrap: PAL.red }[def.kind];
    if (def.kind === "wrap") k.node(L.dolls, k.box(def.x + 0.8, WY - 0.75, 0, 0.9, 0.7, 0.8, PAL.wood) + k.cyl(def.x + 1.25, WY - 0.4, 0.8, 0.2, 0.45, PAL.white));   // a roll of wrapping paper
    const st = { ...def, who: F.worker(L, { x: def.x, y: WY, look, coat, phase: i * 1.7 }), cur: null, let: -9 };
    if (def.kind === "filter") st.bin = F.bin(L, def.x + 0.15, BY + 1.3, 1.2, 1.0, 0.7, PAL.red);
    return st;
  }

  function newCandy(born) {
    let small = rnd() < 0.34;
    if (small && smallRun >= 2) small = false;
    smallRun = small ? smallRun + 1 : 0;
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    lastFlavor = fl;
    const it = F.thing(L.candy, { flavor: fl, small }); it.born = born; it.state = "line"; it.done = 0;
    items.push(it);
    return it;
  }
  const gap = () => (rnd() < 0.2 ? 0.85 + rnd() * 0.2 : 1.3 + rnd() * 2.1);    // candies come unevenly, sometimes two close together

  /* what a worker does to the candy in hand */
  function work(it, st, now, quiet) {
    if (st.kind === "watch") { if (!quiet) counts.seen++; }
    else if (st.kind === "wrap") { it.wrapped = true; F.redraw(it); if (!quiet) counts.wrapped++; }
    else if (it.small) {
      it.state = "out";
      if (quiet) it.el.remove(); else { it.el.classList.remove("busy"); F.drop(it, it.pos, st.bin, now); st.let = now; st.toss = it; counts.small++; }
    } else if (!quiet) counts.passed++;
  }

  function place(it, now) {
    if (it.state !== "line") return;
    const x = F.V * (now - it.born), next = stations[it.done];
    if (!it.act && next && x >= next.x - (F.V * HOLD) / 2) { it.act = { st: next, t0: now, did: false }; next.cur = it; it.done++; }
    let z = F.TOP, o = {};
    if (it.act) {
      const a = it.act, u = (now - a.t0) / HOLD, light = a.st.kind === "watch";
      z += (light ? 0.14 : LIFT) * Math.sin(Math.PI * Math.min(1, u));
      o = { air: !light, busy: !light && u > 0.2 && u < 0.85, rot: a.st.kind === "wrap" ? 12 * Math.sin(u * Math.PI * 4) : 0, s: a.st.kind === "wrap" && a.did ? 1 + 0.3 * Math.sin(Math.PI * Math.min(1, (u - 0.5) * 2.4)) : 1 };
      if (u >= 0.5 && !a.did) { a.did = true; work(it, a.st, now, false); if (it.state !== "line") { a.st.cur = null; return; } }
      if (u >= 1) { it.act = null; if (a.st.cur === it) a.st.cur = null; o = {}; z = F.TOP; }
    }
    if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
    F.put(it, P(x, BY, z), o);
    it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
  }

  function workers(now, dt) {
    stations.forEach((st) => {
      let h = [null, null];
      const it = st.cur, r = it ? it.r * U : 0;
      if (it && it.pos) h = st.kind === "watch" ? [[it.pos[0] - 2, it.pos[1] - 2 * r - 2], null] : F.grip([it.pos[0], it.pos[1] - r], r * 0.9);
      else if (st.toss && now - st.let < 0.2 && st.toss.pos) h = F.grip(st.toss.pos, 8);     // the hands follow a candy they throw away
      st.who.pose(now, dt, h);
    });
  }

  /* labels: each scene names only what it is about */
  function labels() {
    const first = stations[0], last = stations[stations.length - 1], head = (st) => [st.who.foot[0] + 15 * F.MAN, st.who.foot[1] - 60 * F.MAN];
    const list = [
      { title: "KITCHEN", note: "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "THE LINE", note: "never stops, never ends", x: 56, y: 486, side: "start", to: P(1.9, BY + 0.5, F.TOP) },
      { title: "CLOCK", note: "every candy has its moment", x: 1344, y: 130, side: "end", to: P(CLOCK[0] + 0.45, 0, CLOCK[1] + 0.2) },
      { title: "SHIPPING", note: "out as soon as it is ready", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ];
    const who = (st, title, note, y) => list.push({ title, note, x: 1344, y, side: "end", to: head(st) });
    if (sc.id === "line") who(first, "WORKER", "gives each candy a pat as it passes", 300);
    if (sc.id === "inspector") who(first, "INSPECTOR", "one look, one decision", 300);
    if (sc.id === "wrapper") who(first, "WRAPPER", "one in, one out, changed", 300);
    if (sc.id === "both") { who(first, "INSPECTOR", "first job: pick", 250); who(last, "WRAPPER", "second job: wrap", 380); }
    const fl = stations.find((s) => s.bin);
    if (fl) list.push({ title: "TOO SMALL", note: "off the line, for good", x: 56, y: 660, side: "start", to: P(fl.bin.x - 0.45, fl.bin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; sc = scene; rnd = kit.rng(7);
    items = []; smallRun = 0; lastFlavor = null; counts = { seen: 0, passed: 0, small: 0, wrapped: 0 };
    F.room({ window: [1.2, 3.3], clock: CLOCK, door: 11.2 });
    // the moving part of the sheet, back to front
    L = { clock: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), arms: k.layer(), over: k.layer() };
    hands = F.clockHands(L.clock, CLOCK);
    line = F.belt(L.belt, 0, X1, BY);
    stations = scene.stations.map(station);
    ship = F.bin(L, X1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, k.PAL.wood);
    k.labelLayer(); labels();
    k.focus([246, 24, 908, 760]);
    // the line is already running when the story opens: candies made in the last seconds are on their way
    nextBorn = -X1 / F.V + 0.4;
    while (nextBorn <= 0) {
      const it = newCandy(nextBorn), x = -F.V * it.born;
      while (it.state === "line" && it.done < stations.length && x >= stations[it.done].x) work(it, stations[it.done++], 0, true);
      nextBorn += gap();
    }
    tick(0, 0);
  }

  function tick(dt, now) {
    while (nextBorn <= now) { newCandy(nextBorn); nextBorn += gap(); }
    items.forEach((it) => place(it, now));
    items = items.filter((it) => it.state === "line");
    F.run(now);
    workers(now, dt);
    line.update(now); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (sc.id === "line") return n(counts.seen, "candy", "candies") + " so far";
    if (sc.id === "inspector") return `${counts.passed} passed · ${counts.small} too small`;
    if (sc.id === "wrapper") return `${counts.wrapped} wrapped`;
    return `${counts.wrapped} wrapped · ${counts.small} too small`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
