/* Story 01, The candy line. It follows lab 01, stateless transform, tab by tab.
   A stream is a line that never ends. An event is one candy: its flavor is the key, the weight on its tag is the value,
   and the clock tells its time. An operator is a worker who handles one candy at a time and remembers nothing.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const X1 = 10.6, BY = 3.9;                 // the line ends at X1 and runs along y = BY
  const HOLD = 0.8;                          // seconds a worker has a candy in hand
  const LIMIT = 30, RATE = 2;                // the filter keeps candies heavier than LIMIT grams; the price is RATE cents a gram
  const CLOCK = [5.9, 2.85, 0.6];

  const SCENES = [
    { id: "line", label: "The line", stations: [{ kind: "watch", x: 4.6 }],
      story: "A stream is like this candy line. It has no last candy. Each candy is one event: it has a flavor, a weight on its tag, and the moment it rolled out of the kitchen, which the clock on the wall keeps. Candies come when they come, so the gaps are uneven. Nobody waits for the batch to be finished, because it never is: every candy goes out the moment it arrives." },
    { id: "inspector", label: "The inspector", stations: [{ kind: "filter", x: 4.6 }],
      story: `The worker picks up one candy at a time and decides on the spot. Heavier than ${LIMIT} grams goes back on the line, unchanged. ${LIMIT} grams or less goes in the bin. Nothing is remembered from one candy to the next. Engineers call this a filter.` },
    { id: "pricer", label: "The price", stations: [{ kind: "price", x: 4.6 }],
      story: `One candy in, one candy out. The worker wraps each candy and works out a new number from the old one: ${RATE} cents for every gram. The flavor and the time stay the same, and again nothing is remembered. Engineers call this a transform.` },
    { id: "both", label: "The whole line", stations: [{ kind: "filter", x: 2.9 }, { kind: "price", x: 6.9 }],
      story: "Workers stand in a row and each one does a small job: the first takes out the light candies, the second wraps and prices the rest. Every candy is still handled on its own. That is why this line can stop and start again at any candy, with nothing to remember. Engineers call such work stateless." },
  ];

  let k, F, P, U, rnd, sc, L, line, ship, hands, items, stations, nextBorn, lightRun, lastFlavor, counts;
  const ease = (u) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };

  function station(def, i) {
    const PAL = k.PAL, look = { watch: 0, filter: 1, price: 2 }[def.kind], coat = { watch: PAL.green, filter: PAL.blue, price: PAL.red }[def.kind];
    const st = { ...def, who: F.worker(L, { x: def.x, y: BY - F.GAP, look, coat, phase: i * 1.7 }), cur: null, pick: def.x - 0.1 };
    if (def.kind === "filter") st.bin = F.bin(L, def.x + 0.1, BY + 1.2, 1.2, 1.0, 0.7, PAL.red);
    return st;
  }

  function newCandy(born) {
    let light = rnd() < 0.3;
    if (light && lightRun >= 2) light = false;
    lightRun = light ? lightRun + 1 : 0;
    const grams = light ? 22 + Math.floor(rnd() * 9) : 31 + Math.floor(rnd() * 9);      // 22 to 30, or 31 to 39
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    lastFlavor = fl;
    const it = F.thing(L.candy, { flavor: fl, small: light, flag: grams + " g" }); it.grams = grams; it.born = born; it.state = "line"; it.done = 0;
    items.push(it);
    return it;
  }
  const gap = () => (rnd() < 0.2 ? 0.95 + rnd() * 0.2 : 1.4 + rnd() * 2.1);    // candies come unevenly, sometimes two close together

  /* what a worker does to the candy in hand */
  function work(it, st, now, quiet) {
    if (st.kind === "watch") { if (!quiet) counts.seen++; return; }
    if (st.kind === "price") { it.wrapped = true; it.flag = it.grams * RATE + "¢"; F.redraw(it); if (!quiet) counts.priced++; return; }
    if (it.grams > LIMIT) { if (!quiet) counts.passed++; return; }
    it.state = "out";
    if (quiet) it.el.remove(); else { it.el.classList.remove("busy"); F.drop(it, it.pos, st.bin, now); st.toss = it; st.let = now; counts.light++; }
  }

  function place(it, now) {
    if (it.state !== "line") return;
    const x = F.V * (now - it.born), next = stations[it.done];
    if (!it.act && next && x >= next.pick) { it.act = { st: next, t0: now, did: false }; next.cur = it; it.done++; }
    let p = P(x, BY, F.TOP), o = {};
    if (it.act) {
      const a = it.act, u = (now - a.t0) / HOLD;
      if (a.st.kind !== "watch") {
        // off the line and up to the chest, worked on there, then down again a little further along, where the line has moved to meanwhile
        const from = P(a.st.pick, BY, F.TOP), to = P(a.st.pick + F.V * HOLD, BY, F.TOP), c = a.st.who.chest(it.r * U);
        const up = ease(u / 0.3), down = ease((u - 0.7) / 0.3), q = u < 0.5 ? [from[0] + (c[0] - from[0]) * up, from[1] + (c[1] - from[1]) * up] : [c[0] + (to[0] - c[0]) * down, c[1] + (to[1] - c[1]) * down];
        p = [q[0], q[1] - 5 * Math.sin(Math.PI * (u < 0.5 ? up : down))];
        it.clear = a.st.pick + F.V * HOLD + 0.75;
        o = { air: u > 0.06 && u < 0.94, low: u > 0.06, busy: u > 0.3 && u < 0.7, rot: a.st.kind === "price" && u > 0.3 && u < 0.7 ? 10 * Math.sin((u - 0.3) * Math.PI * 7.5) : 0 };
      }
      if (u >= 0.5 && !a.did) { a.did = true; work(it, a.st, now, false); if (it.state !== "line") { a.st.cur = null; return; } }
      if (u >= 1) { it.act = null; if (a.st.cur === it) a.st.cur = null; p = P(x, BY, F.TOP); o = {}; }
    }
    if (!it.act && it.clear) { if (x < it.clear) o.low = true; else it.clear = null; }     // its tag stays low until it is clear of the worker
    if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
    F.put(it, p, o);
    it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
  }

  function workers(now, dt) {
    stations.forEach((st) => {
      let h = [null, null];
      const it = st.cur || items.find((c) => c.state === "line" && c.done === stations.indexOf(st) && F.V * (now - c.born) > st.pick - 0.3);    // the next candy is reached for a moment before it is taken
      if (it && it.pos) { const mid = [it.pos[0], it.pos[1] - it.r * U]; h = st.kind === "watch" ? [[mid[0], mid[1] - it.r * U], null] : F.grip(mid, it.r * U * 0.85); }
      else if (st.toss && now - st.let < 0.16 && st.toss.pos) h = [[st.toss.pos[0], st.toss.pos[1] - 12], null];     // the hand follows a candy it throws away
      st.who.pose(now, dt, h);
    });
  }

  /* labels: each scene names only what it is about */
  function labels() {
    const first = stations[0], last = stations[stations.length - 1], head = (st) => [st.who.foot[0] + 15 * F.MAN, st.who.foot[1] - 60 * F.MAN];
    const list = [
      { title: "KITCHEN", note: "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.6) },
      { title: "CANDY", note: "its flavor, and its weight on a tag", x: 56, y: 486, side: "start", to: P(1.5, BY + 0.5, F.TOP) },
      { title: "CLOCK", note: "every candy has its moment", x: 1344, y: 130, side: "end", to: P(CLOCK[0] + 0.45, 0, CLOCK[1] + 0.2) },
      { title: "SHIPPING", note: "out as soon as it is ready", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ];
    const who = (st, title, note, y) => list.push({ title, note, x: 1344, y, side: "end", to: head(st) });
    if (sc.id === "line") who(first, "WORKER", "lets every candy pass as it is", 300);
    if (sc.id === "inspector") who(first, "INSPECTOR", `keeps what is heavier than ${LIMIT} g`, 300);
    if (sc.id === "pricer") who(first, "PRICER", `wraps it and writes ${RATE}¢ a gram`, 300);
    if (sc.id === "both") { who(first, "INSPECTOR", "first job: pick", 250); who(last, "PRICER", "second job: wrap and price", 380); }
    const fl = stations.find((s) => s.bin);
    if (fl) list.push({ title: "TOO LIGHT", note: `${LIMIT} g or less: off the line`, x: 56, y: 660, side: "start", to: P(fl.bin.x - 0.45, fl.bin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; sc = scene; rnd = kit.rng(7); F.reset();
    items = []; lightRun = 0; lastFlavor = null; counts = { seen: 0, passed: 0, light: 0, priced: 0 };
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
      while (it.state === "line" && it.done < stations.length && x >= stations[it.done].pick) work(it, stations[it.done++], 0, true);
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
    if (sc.id === "inspector") return `${counts.passed} passed · ${counts.light} too light`;
    if (sc.id === "pricer") return `${counts.priced} priced`;
    return `${counts.priced} priced · ${counts.light} too light`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
