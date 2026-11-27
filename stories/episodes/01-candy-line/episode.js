/* Story 01, The candy line. It follows lab 01, stateless transform, tab by tab.
   A stream is a line that never ends. An event is one candy: its flavor is the key, and the clock tells its time.
   A candy comes out of the kitchen with nothing written on it. An operator is a worker who handles one candy at a time and
   remembers nothing. The first job on this line is to weigh: the worker puts the candy on the scale, reads the weight and
   ties on a tag that says so. That number is the value, and the workers further along work with it.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const X1 = 10.6, BY = 3.9;                 // the line ends at X1 and runs along y = BY
  const LEAD = 0.36, CARRY = 0.7;            // a hand starts to reach LEAD seconds before the candy arrives; the candy is set down as far along as the line runs in CARRY seconds
  const LIMIT = 30, RATE = 2;                // the filter keeps candies heavier than LIMIT grams; the price is RATE cents a gram
  const CLOCK = [5.9, 2.85, 0.6];
  const PAN = [30, -29];                     // the pan of the scale, measured from the worker's feet: at the worker's side, at hip height

  const SCENES = [
    { id: "line", label: "The line", stations: [{ kind: "weigh", x: 4.6 }],
      story: "A stream is like this candy line. It has no last candy. Each candy is one event, and candies come when they come, so the gaps are uneven. The worker does one small job on every candy as it arrives: puts it on the scale, reads the weight and ties on a tag that says so. Nobody waits for the batch to be finished, because it never is. Engineers call the worker an operator." },
    { id: "inspector", label: "The inspector", stations: [{ kind: "filter", x: 4.6 }],
      story: `The worker weighs one candy at a time and decides on the spot. Heavier than ${LIMIT} grams gets its tag and goes back on the line. ${LIMIT} grams or less goes in the bin. Nothing is remembered from one candy to the next. Engineers call this a filter.` },
    { id: "pricer", label: "The price", stations: [{ kind: "weigh", x: 2.9 }, { kind: "price", x: 6.9 }],
      story: `One candy in, one candy out. The first worker weighs each candy and tags it. The second reads the tag, wraps the candy and writes a new number worked out from the old one: ${RATE} cents for every gram. The flavor stays the same, and again nothing is remembered. Engineers call this a transform.` },
    { id: "both", label: "The whole line", stations: [{ kind: "filter", x: 2.9 }, { kind: "price", x: 6.9 }],
      story: "Workers stand in a row and each one does a small job: the first weighs every candy and takes out the light ones, the second wraps and prices the rest. Every candy is still handled on its own. That is why this line can stop and start again at any candy, with nothing to remember. Engineers call such work stateless." },
  ];

  let k, F, P, U, rnd, sc, L, line, ship, hands, items, stations, nextBorn, lightRun, lastFlavor, counts;
  const mid = (it) => [it.pos[0], it.pos[1] - it.r * U];           // the middle of a candy
  const plus = (p, g) => [p[0] + g[0], p[1] + g[1]];
  const scribble = (p, t) => (u) => [p[0] + 2.2 * Math.sin((u - t) * 63), p[1] + 1.5 * Math.sin((u - t) * 39)];

  /* a bench scale on a stand at the worker's side: a pan on the left, and a window that shows the weight */
  function scale(st) {
    const [fx, fy] = st.who.foot, x = fx + PAN[0], y = fy + PAN[1], PAL = k.PAL;
    const el = k.node(L.dolls, k.edges([[[x - 8, y + 21], [x - 8, y + 48]], [[x + 52, y + 21], [x + 52, y + 82]]], { w: 2.2, over: 0 })
      + k.shape(`M${x - 18} ${y + 5}L${x + 62} ${y + 5}L${x + 62} ${y + 22}L${x - 18} ${y + 22}Z`, PAL.steel, 1.4)
      + k.shape(`M${x - 3.5} ${y}L${x + 3.5} ${y}L${x + 3.5} ${y + 5}L${x - 3.5} ${y + 5}Z`, k.darker(PAL.steel, 0.12), 1.1)
      + `<ellipse cx="${x}" cy="${y}" rx="18" ry="5" fill="${k.lighter(PAL.steel, 0.3)}" class="ink-f" stroke-width="1.4"/>`
      + k.shape(`M${x + 22} ${y + 7.5}L${x + 59} ${y + 7.5}L${x + 59} ${y + 19.5}L${x + 22} ${y + 19.5}Z`, PAL.white, 1)
      + `<text class="flag-t" x="${x + 40.5}" y="${y + 17.6}" text-anchor="middle" style="font-size:12.5px"></text>`);
    st.pan = [x, y]; st.read = [x + 40, y + 13]; st.disp = el.querySelector("text"); st.load = null;
  }

  function station(def, i) {
    const PAL = k.PAL, look = { weigh: 0, filter: 1, price: 2 }[def.kind], coat = { weigh: PAL.green, filter: PAL.blue, price: PAL.red }[def.kind];
    const st = { ...def, i, cur: null, next: null, eye: null, pick: def.x - 0.1 };
    st.who = F.worker(L, { x: def.x, y: BY - F.GAP, look, coat, phase: i * 1.7, rest: def.kind === "price" ? null : [[-17, -19], [3, -15]] });
    st.put = st.pick + F.V * CARRY;
    if (def.kind !== "price") scale(st);
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
    const it = F.thing(L.candy, { flavor: fl, small: light }); it.grams = grams; it.born = born; it.state = "line"; it.done = 0;      // no tag yet: nobody has weighed it
    items.push(it);
    return it;
  }
  const gap = () => (rnd() < 0.2 ? 1.7 + rnd() * 0.2 : 2.0 + rnd() * 1.9);    // candies come unevenly, but never faster than a pair of hands can take them

  /* what a worker's job does to a candy; the answer is whether the candy stays on the line */
  function work(it, st, quiet) {
    if (st.kind === "price") { it.wrapped = true; it.flag = it.grams * RATE + "¢"; F.redraw(it); if (!quiet) counts.priced++; return true; }
    if (st.kind === "filter" && it.grams <= LIMIT) { if (!quiet) counts.light++; return false; }
    it.flag = it.grams + " g"; F.redraw(it);
    if (!quiet) counts[st.kind === "filter" ? "passed" : "weighed"]++;
    return true;
  }
  /* set a candy down where the line will be at that moment, with hand i */
  function setDown(st, it, i, t0) {
    const w = st.who, r = it.r * U, g = F.grasp(i, r), tr = t0 + 0.3, born = tr - st.put / F.V;
    w.go(i, (t) => { const b = P(F.V * (t - born), BY, F.TOP); return [b[0] + g[0], b[1] - r + g[1]]; }, t0, 0.3);
    F.later(tr, () => { it.hand = null; it.state = "line"; it.born = born; it.clear = st.put + 0.75; w.go(i, null, tr, 0.36); });
    F.later(tr + 0.25, () => { if (st.cur === it) st.cur = null; });
  }

  /* Weighing, as a person does it. The eyes go to the candy first. The left hand meets it as it arrives, carries it across
     and sets it on the pan, then lets go, because a hand on the pan would spoil the weight. The window shows the weight and
     the worker reads it. The right hand ties on a blank tag and writes the weight on it, then picks the candy up and sets
     it down on the line a little further along. An inspector who reads 30 grams or less throws the candy in the bin instead. */
  function weigh(st, it, tp) {
    const w = st.who, r = it.r * U, g0 = F.grasp(0, r), g1 = F.grasp(1, r), C = [st.pan[0], st.pan[1] - r], tie = [C[0] + 10, st.pan[1] + 12];
    const keep = st.kind === "weigh" || it.grams > LIMIT, t1 = tp + 0.36;
    it.state = "hand"; st.cur = it; st.next = null; it.done++;
    F.give(it, w, 0);
    w.go(0, (t) => [C[0] + g0[0], C[1] + g0[1] + 7 * Math.sin(Math.PI * Math.min(1, (t - tp) / 0.36))], tp, 0.36);      // across, a little below the chin
    F.later(t1, () => { it.hand = null; it.state = "scale"; it.on = [st.pan[0], st.pan[1]]; st.load = { g: it.grams, t0: t1 }; w.go(0, null, t1, 0.34); });
    F.later(t1 + 0.1, () => { st.eye = st.read; });
    if (keep) {
      const t2 = tp + 0.62, t3 = t2 + 0.24, t4 = t3 + 0.3;
      F.later(t2, () => { st.tag = k.node(L.over, `<path d="M-11 -7L11 -7L11 7L-11 7Z" fill="${k.PAL.white}" class="ink-f" stroke-width="1.1"/>`); w.go(1, tie, t2, 0.24); });      // a blank tag out of the apron pocket
      F.later(t2 + 0.14, () => { st.eye = null; });
      F.later(t3, (t) => { st.tag.remove(); st.tag = null; it.flag = "    "; F.redraw(it); w.go(1, scribble(tie, t), t, 0.05); });
      F.later(t3 + 0.12, () => work(it, st, false));
      F.later(t3 + 0.2, () => w.go(1, plus(C, g1), t3 + 0.2, 0.1));
      F.later(t4, () => { it.state = "hand"; F.give(it, w, 1); st.load = null; setDown(st, it, 1, t4); });
    } else {
      const t2 = tp + 0.72, t3 = t2 + 0.24;
      F.later(t2, () => { st.eye = null; work(it, st, false); w.go(1, plus(C, g1), t2, 0.24); });
      F.later(t3, () => { it.state = "hand"; F.give(it, w, 1); st.load = null; w.go(1, [w.foot[0] - 2, w.foot[1] - 37], t3, 0.2); });      // a short swing towards the bin
      F.later(t3 + 0.2, (t) => { it.hand = null; it.state = "out"; F.drop(it, it.pos, st.bin, t); w.go(1, null, t, 0.42); });
      F.later(t3 + 0.6, () => { if (st.cur === it) st.cur = null; });
    }
  }
  /* Pricing, as a person does it. One hand meets the candy as it arrives and lifts it in front of the belly, where its tag can
     be read. The other hand joins to wrap it, and the tag gets its new number. Then one hand sets it down again. */
  function price(st, it, tp) {
    const w = st.who, r = it.r * U, g0 = F.grasp(0, r), g1 = F.grasp(1, r), H = w.hold, t1 = tp + 0.4, t2 = tp + 0.8, wave = (t) => Math.sin(((t - t1) / (t2 - t1)) * Math.PI * 4);
    it.state = "hand"; st.cur = it; st.next = null; it.done++;
    F.give(it, w, 0); w.go(0, plus(H, g0), tp, 0.3);
    F.later(tp + 0.1, () => w.go(1, plus(H, g1), tp + 0.1, 0.28));
    F.later(t1, () => { it.busy = true; it.rot = (t) => 10 * wave(t); w.go(1, (t) => plus(H, [g1[0], g1[1] + 3 * wave(t)]), t1, 0.05); });       // wrapping: the candy is turned by one hand in the other
    F.later(tp + 0.6, () => work(it, st, false));
    F.later(t2, () => { it.busy = false; it.rot = null; F.give(it, w, 1); w.go(0, null, t2, 0.36); setDown(st, it, 1, t2); });
  }
  /* each worker keeps an eye on the next candy, and starts to reach a moment before it arrives */
  function attend(st, now) {
    const w = st.who, it = st.cur || st.next || items.find((c) => c.state === "line" && c.done === st.i);
    w.look(st.eye || (it && it.pos && (it.state !== "line" || F.V * (now - it.born) > st.pick - 2.4) ? () => (it.pos ? mid(it) : null) : null));
    if (st.cur || st.next || !it) return;
    const tp = it.born + st.pick / F.V;
    if (tp - now > LEAD) return;
    st.next = it;
    w.go(0, () => it.pos && plus(mid(it), F.grasp(0, it.r * U)), now, Math.max(0.12, tp - now));
    F.later(tp, () => (st.kind === "price" ? price : weigh)(st, it, tp));
  }

  function place(it, now) {
    if (it.state === "hand") { F.put(it, F.carried(it), { air: true, low: true, busy: it.busy, rot: it.rot ? it.rot(now) : 0 }); return; }
    if (it.state === "scale") { F.put(it, it.on, { air: true, low: true }); return; }
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
      { title: "CANDY", note: "a flavor, and a weight nobody knows yet", x: 56, y: 486, side: "start", to: P(1.2, BY + 0.5, F.TOP) },
      { title: "CLOCK", note: "every candy has its moment", x: 1344, y: 130, side: "end", to: P(CLOCK[0] + 0.45, 0, CLOCK[1] + 0.2) },
      { title: "SHIPPING", note: "out as soon as it is ready", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ];
    const who = (st, title, note, y) => list.push({ title, note, x: 1344, y, side: "end", to: head(st) });
    if (sc.id === "line") who(first, "WORKER", "weighs every candy and tags it", 250);
    if (sc.id === "inspector") who(first, "INSPECTOR", `weighs, and keeps what is heavier than ${LIMIT} g`, 250);
    if (sc.id === "pricer") { who(first, "WEIGHER", "first job: weigh and tag", 230); who(last, "PRICER", `second job: wrap, write ${RATE}¢ a gram`, 400); }
    if (sc.id === "both") { who(first, "INSPECTOR", "first job: weigh and pick", 230); who(last, "PRICER", "second job: wrap and price", 400); }
    list.push({ title: "SCALE", note: "shows the weight of what is on it", x: 1344, y: stations.length > 1 ? 310 : 370, side: "end", to: [first.pan[0] + 61, first.pan[1] + 9] });
    const fl = stations.find((s) => s.bin);
    if (fl) list.push({ title: "TOO LIGHT", note: `${LIMIT} g or less: off the line`, x: 56, y: 660, side: "start", to: P(fl.bin.x - 0.45, fl.bin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; sc = scene; rnd = kit.rng(7); F.reset();
    items = []; lightRun = 0; lastFlavor = null; counts = { weighed: 0, passed: 0, light: 0, priced: 0 };
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
    stations.forEach((st) => {
      attend(st, now); st.who.pose(now, dt);
      if (st.disp) st.disp.textContent = (st.load ? Math.round(st.load.g * Math.min(1, (now - st.load.t0) / 0.22)) : 0) + " g";      // the window of the scale
      if (st.tag) { const h = st.who.at(1); st.tag.setAttribute("transform", `translate(${k.f(h[0] + 1)} ${k.f(h[1] - 9)})`); }       // a blank tag in the hand
    });
    items.forEach((it) => place(it, now));
    items = items.filter((it) => it.state !== "out");
    line.update(now); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (sc.id === "line") return n(counts.weighed, "candy", "candies") + " weighed";
    if (sc.id === "inspector") return `${counts.passed} passed · ${counts.light} too light`;
    if (sc.id === "pricer") return `${counts.priced} priced`;
    return `${counts.priced} priced · ${counts.light} too light`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
