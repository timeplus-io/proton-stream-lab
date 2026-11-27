/* Story 01, The candy line. It follows lab 01, stateless transform, tab by tab.
   A stream is a line that never ends. An event is one candy: its flavor is the key, the weight on its tag is the value,
   and the clock tells its time. An operator is a worker who handles one candy at a time and remembers nothing.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const X1 = 10.6, BY = 3.9;                 // the line ends at X1 and runs along y = BY
  const LEAD = 0.36, CARRY = 0.7;            // a hand starts to reach LEAD seconds before the candy arrives; the candy is set down as far along as the line runs in CARRY seconds
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
  const mid = (it) => [it.pos[0], it.pos[1] - it.r * U];           // the middle of a candy
  const plus = (p, g) => [p[0] + g[0], p[1] + g[1]];

  function station(def, i) {
    const PAL = k.PAL, look = { watch: 0, filter: 1, price: 2 }[def.kind], coat = { watch: PAL.green, filter: PAL.blue, price: PAL.red }[def.kind];
    const st = { ...def, i, who: F.worker(L, { x: def.x, y: BY - F.GAP, look, coat, phase: i * 1.7 }), cur: null, next: null, pick: def.x - 0.1 };
    st.put = st.pick + F.V * CARRY;
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
  const gap = () => (rnd() < 0.2 ? 1.6 + rnd() * 0.2 : 1.9 + rnd() * 1.9);    // candies come unevenly, but never faster than a pair of hands can take them

  /* what a worker does to the candy in hand; the answer is whether the candy stays on the line */
  function work(it, st, quiet) {
    if (st.kind === "watch") { if (!quiet) counts.seen++; return true; }
    if (st.kind === "price") { it.wrapped = true; it.flag = it.grams * RATE + "¢"; F.redraw(it); if (!quiet) counts.priced++; return true; }
    if (it.grams > LIMIT) { if (!quiet) counts.passed++; return true; }
    if (!quiet) counts.light++;
    return false;
  }

  /* The moves of a worker for one candy, as a person makes them. The eyes go to the candy first. One hand reaches out and
     meets it at the moment it arrives, and lifts it in front of the belly. The other hand joins for the work. Then one hand
     alone sets it down on the line a little further along, or tosses it in the bin, and both hands go back to the worker's sides. */
  function take(st, it, tp) {
    const w = st.who, r = it.r * U, g0 = F.grasp(0, r), g1 = F.grasp(1, r), H = w.hold, t1 = tp + 0.4, t2 = tp + 0.8, wave = (t) => Math.sin(((t - t1) / (t2 - t1)) * Math.PI * 4);
    it.state = "hand"; st.cur = it; st.next = null; it.done++;
    F.give(it, w, 0); w.go(0, plus(H, g0), tp, 0.3);
    F.later(tp + 0.1, () => w.go(1, plus(H, g1), tp + 0.1, 0.28));
    F.later(t1, () => {
      it.busy = true;
      if (st.kind === "price") { it.rot = (t) => 10 * wave(t); w.go(1, (t) => plus(H, [g1[0], g1[1] + 3 * wave(t)]), t1, 0.05); }       // wrapping: the candy is turned by one hand in the other
      else [g0, g1].forEach((g, i) => w.go(i, (t) => plus(H, [g[0], g[1] + 2.2 * Math.abs(wave(t))]), t1, 0.05));                         // weighing: both hands bounce it a little
    });
    F.later(tp + 0.6, () => { it.keep = work(it, st, false); });
    F.later(t2, () => {
      it.busy = false; it.rot = null;
      if (it.keep) {
        const tr = t2 + 0.32, born = tr - st.put / F.V;                                   // set down where the line will be at that moment
        F.give(it, w, 1); w.go(0, null, t2, 0.36);
        w.go(1, (t) => { const b = P(F.V * (t - born), BY, F.TOP); return [b[0] + g1[0], b[1] - r + g1[1]]; }, t2, 0.32);
        F.later(tr, () => { it.hand = null; it.state = "line"; it.born = born; it.clear = st.put + 0.75; w.go(1, null, tr, 0.36); });
        F.later(tr + 0.25, () => { if (st.cur === it) st.cur = null; });
      } else {
        const tr = t2 + 0.2;
        w.go(1, null, t2, 0.36); w.go(0, [w.foot[0] - 31, w.foot[1] - 27], t2, 0.2);     // a short swing towards the bin
        F.later(tr, () => { it.hand = null; it.state = "out"; F.drop(it, it.pos, st.bin, tr); w.go(0, null, tr, 0.42); });
        F.later(tr + 0.4, () => { if (st.cur === it) st.cur = null; });
      }
    });
  }
  /* a worker who only watches taps each candy as it goes by, and follows it with the eyes */
  function touch(st, it, tp) {
    it.done++; st.cur = it; st.next = null; work(it, st, false); it.clear = st.put + 0.75;
    F.later(tp + 0.1, () => st.who.go(0, null, tp + 0.1, 0.4));
    F.later(tp + 0.6, () => { if (st.cur === it) st.cur = null; });
  }
  /* each worker keeps an eye on the next candy, and starts to reach a moment before it arrives */
  function attend(st, now) {
    const w = st.who, it = st.cur || st.next || items.find((c) => c.state === "line" && c.done === st.i);
    w.look(it && it.pos && F.V * (now - it.born) > st.pick - 2.4 ? () => (it.pos ? mid(it) : null) : null);
    if (st.cur || st.next || !it) return;
    const tp = it.born + st.pick / F.V;
    if (tp - now > LEAD) return;
    st.next = it;
    const g = st.kind === "watch" ? [0, -it.r * U] : F.grasp(0, it.r * U);
    w.go(0, () => it.pos && plus(mid(it), g), now, Math.max(0.12, tp - now));
    F.later(tp, () => (st.kind === "watch" ? touch : take)(st, it, tp));
  }

  function place(it, now) {
    if (it.state === "hand") { F.put(it, F.carried(it), { air: true, low: true, busy: it.busy, rot: it.rot ? it.rot(now) : 0 }); return; }
    if (it.state !== "line") return;
    const x = F.V * (now - it.born), o = {};
    if (it.clear) { if (x < it.clear) o.low = true; else it.clear = null; }     // its tag stays low until it is clear of the worker
    if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
    F.put(it, P(x, BY, F.TOP), o);
    it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
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
      while (it.state === "line" && it.done < stations.length && x >= stations[it.done].pick) { if (!work(it, stations[it.done++], true)) { it.state = "out"; it.el.remove(); } }
      nextBorn += gap();
    }
    items = items.filter((it) => it.state === "line");
    tick(0, 0);
  }

  function tick(dt, now) {
    while (nextBorn <= now) { newCandy(nextBorn); nextBorn += gap(); }
    F.run(now);
    stations.forEach((st) => { attend(st, now); st.who.pose(now, dt); });
    items.forEach((it) => place(it, now));
    items = items.filter((it) => it.state !== "out");
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
