/* Story 03, Two lines meet.
   Bringing two things together. First a candy and a chart on the wall, which never changes.
   Then two lines that both move: candies and cups. A candy and a cup of the same flavor make a pair,
   the racks are what the worker has to remember, and the three scenes are three ways to keep the racks from filling up. */
(() => {
  const CLOCK = [2.2, 2.85, 0.6];
  /* scene 1: one line and a chart on the wall */
  const BY = 3.9, WY = 2.95, SX = 5.2, X1 = 10.6, HOLD = 1.0, LIFT = 0.42;
  const CH = { x: 6.9, w: 2.7, z: 3.35, h: 2.15 };
  /* scenes 2 to 4: cups come in at the back, candies at the front, the worker stands between them */
  const YB = 1.4, YF = 5.1, YM = 3.25, XE = 3.0;                // the two lines end at XE; the cards leave along y = YM
  const WX = 3.6, WYM = 2.9;                                    // where the worker stands
  const S0 = 5.4, DS = 0.68, SIZE = 6;                           // places on a rack
  const OUT0 = 9.4, LAND = 9.8, OUT1 = 11.0;                    // the line the pair cards leave on
  const FRESH = 5;                                              // seconds a thing stays fresh

  const SCENES = [
    { id: "lookup", label: "Look it up",
      story: "Sometimes a candy needs something it does not carry itself. Here it is a name. The worker holds up each candy, finds its flavor on the chart and pins the name on. The chart just hangs on the wall and never changes. Engineers call this a join with a table." },
    { id: "keep", label: "Keep everything", two: true,
      story: "Now both sides move. Candies come on one line and cups on the other, and a candy and a cup of the same flavor make a pair. A partner may still be on its way, so the worker keeps everything on the racks and writes a card for every pair. But the lines never end, so the racks fill up, and then the work has to stop. Engineers call this a join of two streams, and the racks its state." },
    { id: "fresh", label: "Only fresh ones", two: true, fresh: true,
      story: "The cure is a rule about time. A candy and a cup only make a pair if they arrived within five seconds of each other. So anything older than five seconds can never find a partner again, and it is cleared away. The racks stay small and the work can go on forever." },
    { id: "newest", label: "Keep the newest", two: true, latest: true,
      story: "Often only the newest counts. The rack holds one cup of each flavor. A new cup takes the place of the old one, and no card is written for it. Each candy gets one card, with the newest cup of its flavor, and moves on. The candy itself is not kept." },
  ];

  let k, F, P, U, PAL, rnd, sc, L, who, hands, ship, belts, items, cards, todo, counts, cur, nextBorn;
  let racks, lanes, hopper, oldBin, banner, halt, lastLand, ahead, seq, deck, hot;

  const later = (t, fn) => todo.push({ t, fn });
  const due = (now) => { const d = todo.filter((j) => j.t <= now); todo = todo.filter((j) => j.t > now); d.sort((a, b) => a.t - b.t).forEach((j) => j.fn(now)); };
  const fadeIn = (it, x) => { it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3)); };
  const top = (it) => (it.kind === "cup" ? 10 : it.r * U);       // half the height of a thing, in sheet units
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ================= scene 1: look it up ================= */
  const chartRow = (i, px = 0) => P(CH.x + (14 + px) / U, 0, CH.z - (50 + i * 27) / U);
  function drawChart() {
    L.board.innerHTML = F.FLAVORS.map((fl, i) => {
      const p = chartRow(i);
      return `<g transform="matrix(${k.CS} ${k.SN} 0 1 ${k.f(p[0])} ${k.f(p[1])})"${hot === fl ? ' class="hot"' : ""}>${k.dot(8, -7, 7.5, PAL[fl], 1.1)}<text class="board-r" x="25" y="0">${F.NAMES[fl]}</text></g>`;
    }).join("");
  }
  function initLookup() {
    F.room({ clock: CLOCK, door: 11.2 });
    k.still(F.panel(CH.x, CH.x + CH.w, CH.z - CH.h, CH.z, "#fdfaf1", 1.7) + `<text class="board-t" transform="${F.onBack(CH.x + 14 / U, CH.z - 22 / U)}">FLAVORS</text>`);
    L = { clock: k.layer(), board: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), air: k.layer(), arms: k.layer(), over: k.layer() };
    belts = [F.belt(L.belt, 0, X1, BY)];
    who = F.worker(L, { x: SX, y: WY, look: 2, coat: PAL.yellow });
    ship = F.bin(L, X1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, PAL.wood);
    drawChart();
    k.labelLayer();
    k.setLabels([
      { title: "KITCHEN", note: "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "CHART", note: "always the same, it never moves", x: 1344, y: 150, side: "end", to: P(CH.x + CH.w - 0.3, 0, CH.z - 0.3) },
      { title: "WORKER", note: "looks up every candy on the chart", x: 56, y: 520, side: "start", to: [who.foot[0] + 15 * F.MAN, who.foot[1] - 58 * F.MAN] },
      { title: "SHIPPING", note: "every candy leaves with its name", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ]);
    // the line is already running when the story opens
    nextBorn = -X1 / F.V + 0.5;
    while (nextBorn <= 0) { const it = candy(nextBorn); if (-F.V * it.born >= SX) { it.done = true; it.flag = F.NAMES[it.flavor]; F.redraw(it); } nextBorn += 1.3 + rnd() * 1.6; }
  }
  function candy(born) {
    const it = F.thing(L.candy, { flavor: F.FLAVORS[Math.floor(rnd() * 3)] }); it.born = born; it.state = "line";
    items.push(it); return it;
  }
  /* the worker has a candy in hand: the row on the chart lights up and its name comes over */
  function lookUp(it, now) {
    const i = F.FLAVORS.indexOf(it.flavor), name = F.NAMES[it.flavor];
    later(now + 0.12, () => { hot = it.flavor; drawChart(); });
    later(now + 0.18, (t) => {
      const tag = k.node(L.air, F.flagArt(name, -2 * it.r * U - 1));
      F.fly(tag, chartRow(i, 60, 0), P(SX, BY, F.TOP + LIFT), t, HOLD / 2 - 0.18, { arc: 12, scale: [0.7, 1], done: () => { tag.remove(); it.flag = name; F.redraw(it); counts.named++; } });
    });
    later(now + 0.8, () => { if (hot === it.flavor) { hot = null; drawChart(); } });
  }
  function tickLookup(dt, now) {
    while (nextBorn <= now) { candy(nextBorn); nextBorn += 1.3 + rnd() * 1.6; }
    items.forEach((it) => {
      const x = F.V * (now - it.born);
      if (!it.done && x >= SX - (F.V * HOLD) / 2) { it.done = true; it.act = now; cur.it = it; lookUp(it, now); }
      let z = F.TOP, o = {};
      if (it.act != null) {
        const u = (now - it.act) / HOLD;
        if (u >= 1) { it.act = null; if (cur.it === it) cur.it = null; } else { z += LIFT * Math.sin(Math.PI * u); o = { air: true, busy: u > 0.2 && u < 0.85 }; }
      }
      if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
      F.put(it, P(x, BY, z), o); fadeIn(it, x);
    });
    items = items.filter((it) => it.state === "line");
  }

  /* ================= scenes 2 to 4: two lines ================= */
  const laneY = (side) => (side === "cup" ? YB : YF);
  const place = (side, i) => P(S0 + DS * i, laneY(side), F.TOP);
  const other = (side) => (side === "cup" ? "candy" : "cup");

  function initTwo() {
    F.room({ hatches: [{ y: YB, sign: "CUPS" }, { y: YF, sign: "CANDY" }], clock: CLOCK });
    L = { clock: k.layer(), board: k.layer(), beltBack: k.layer(), cup: k.layer(), dolls: k.layer(), beltMid: k.layer(), under: k.layer(),
      beltFront: k.layer(), candy: k.layer(), air: k.layer(), arms: k.layer(), over: k.layer() };
    belts = [F.belt(L.beltBack, 0, XE, YB), F.belt(L.beltFront, 0, XE, YF), F.belt(L.beltMid, OUT0, OUT1, YM)];
    who = F.worker(L, { x: WX, y: WYM, look: 2, coat: PAL.yellow });
    ship = F.bin(L, OUT1 + 0.4, YM - 0.7, 1.4, 1.4, 0.75, PAL.wood);
    racks = { cup: Array(sc.latest ? 3 : SIZE).fill(null), candy: Array(SIZE).fill(null) };
    const rackEnd = S0 + DS * (racks.cup.length - 1) + 0.3;
    F.rack(L.beltBack, S0 - 0.3, rackEnd, YB);
    if (sc.latest) {
      oldBin = F.bin(L, 7.3, YB - 0.55, 1.1, 1.1, 0.7, PAL.red);
      hopper = F.bin(L, 4.2, YF - 0.6, 1.2, 1.2, 0.75, PAL.wood);
      F.FLAVORS.forEach((fl, i) => { const it = F.thing(L.cup, { kind: "cup", flavor: fl }); it.side = "cup"; it.state = "rack"; F.put(it, place("cup", i)); racks.cup[i] = it; });   // one cup of each flavor is there already
    } else {
      F.rack(L.beltFront, S0 - 0.3, rackEnd, YF);
      banner = k.node(L.board, F.panel(5.6, 10.4, 1.25, 2.05, "#fbe1da", 1.6) + `<text class="banner" transform="${F.onBack(5.85, 1.47)}">NO ROOM LEFT</text>`, 'style="display:none"');
    }
    const cupEnd = P(rackEnd, YB - 0.5, F.TOP);
    const list = [
      { title: "WORKER", note: "takes every candy and cup in hand", x: 56, y: 560, side: "start", to: [who.foot[0] - 4, who.foot[1] - 30 * F.MAN] },
      { title: "PAIRS", note: "one card for every pair", x: 1344, y: 660, side: "end", to: P(OUT1 + 1.8, YM + 0.2, 0.5) },
    ];
    if (sc.latest) list.push(
      { title: "NEWEST CUPS", note: "one of each flavor", x: 1344, y: 440, side: "end", to: cupEnd },
      { title: "OLD CUPS", note: "replaced, so thrown out", x: 1344, y: 545, side: "end", to: P(8.4, YB, 0.35) },
      { title: "CANDY", note: "gets its card and is not kept", x: 56, y: 690, side: "start", to: P(4.2, YF + 0.2, 0.4) });
    else list.push(
      { title: "CUP RACK", note: sc.fresh ? "each tag shows the age in seconds" : "every cup is kept", x: 1344, y: 470, side: "end", to: cupEnd },
      { title: "CANDY RACK", note: sc.fresh ? "older than 5 seconds: cleared away" : "every candy is kept", x: 56, y: 690, side: "start", to: P(S0, YF + 0.5, 0.45) });
    k.labelLayer(); k.setLabels(list);
    deck = { candy: shuffle(["a", "a", "b", "b", "c", "c"]), cup: shuffle(["a", "a", "b", "b", "c", "c"]) };
    seq = 0; ahead = null; lastLand = -9; halt = null;
  }

  /* what comes next, and when it reaches the end of its line. The two lines take turns, so the worker has one thing in hand at a time. */
  function nextUp() {
    const n = seq++;
    if (sc.latest) {
      const side = n % 3 === 2 ? "cup" : "candy";
      return { t: 0.9 + 1.4 * n, side, flavor: side === "cup" ? F.FLAVORS[Math.floor(n / 3) % 3] : F.FLAVORS[Math.floor(rnd() * 3)] };
    }
    const side = n % 2 ? "cup" : "candy";
    if (!sc.fresh) return { t: 0.9 + 1.5 * n, side, flavor: deck[side][Math.floor(n / 2) % SIZE] };
    const there = racks[other(side)].filter((p) => p && !p.grey);            // likely partners, so that pairs do happen
    return { t: 0.9 + 1.3 * n, side, flavor: there.length && rnd() < 0.62 ? there[Math.floor(rnd() * there.length)].flavor : F.FLAVORS[Math.floor(rnd() * 3)] };
  }
  function spawn(now) {
    for (;;) {
      if (!ahead) ahead = nextUp();
      if (ahead.t - XE / F.V > now) return;
      const it = F.thing(L[ahead.side], { kind: ahead.side, flavor: ahead.flavor });
      it.side = ahead.side; it.born = ahead.t - XE / F.V; it.state = "line"; items.push(it); ahead = null;
    }
  }

  /* a ring around a partner that was found */
  function ring(p, now) {
    const el = k.node(L.air, `<circle class="halo" r="22" cy="${k.f(-top(p))}"/>`, `transform="translate(${k.f(p.pos[0])} ${k.f(p.pos[1])})"`);
    later(now + 0.75, () => el.remove());
  }
  /* a pair card leaves from the partner on the rack and lands on the card line; cards land one after another */
  function pair(p, flavor, t) {
    const start = Math.max(t, lastLand + 0.7 - 0.6); lastLand = start + 0.6;
    const from = [p.pos[0], p.pos[1] - 2 * top(p)];
    later(start, (now) => {
      const c = F.card(L.air, { pair: flavor }); c.el.style.display = "none"; counts.pairs++;
      F.fly(c.el, from, P(LAND, YM, F.TOP), now, 0.6, { arc: 40, scale: [0.5, 1], it: c, done: () => { c.t0 = now + 0.6; cards.push(c); } });
    });
  }
  /* the worker has a thing in hand: find its partners */
  function match(it, now) {
    if (sc.latest && it.side === "cup") {            // a new cup only takes the place of the old one
      const i = F.FLAVORS.indexOf(it.flavor), old = racks.cup[i];
      if (old) { racks.cup[i] = null; L.air.appendChild(old.el); F.drop(old, old.pos, oldBin, now); counts.replaced++; }
      return;
    }
    const found = sc.latest ? [racks.cup[F.FLAVORS.indexOf(it.flavor)]].filter(Boolean)
      : racks[other(it.side)].filter((p) => p && p.state === "rack" && p.flavor === it.flavor && !p.grey);
    found.forEach((p, j) => { ring(p, now); pair(p, it.flavor, now + 0.12 + j * 0.1); });
  }
  /* then put it where it belongs */
  function store(it, now) {
    it.el.classList.remove("busy");
    if (sc.latest && it.side === "candy") { F.drop(it, who.held, hopper, now); return; }
    const i = sc.latest ? F.FLAVORS.indexOf(it.flavor) : racks[it.side].indexOf(null);
    racks[it.side][i] = it; it.t0 = now;
    F.fly(it.el, who.held, place(it.side, i), now, 0.36, { arc: 16, it, done: () => {
      it.el.classList.remove("air"); it.state = "rack";
      racks[it.side].forEach((p) => { if (p && p.state === "rack") L[it.side].appendChild(p.el); });     // nearer places are drawn over farther ones
    } });
  }
  function take(it, now) {
    it.state = "hand"; cur.it = it; it.el.style.opacity = 1; it.el.classList.add("air"); L.air.appendChild(it.el);
    F.fly(it.el, P(XE, laneY(it.side), F.TOP), who.held, now, 0.28, { arc: 8, it });
    if (!sc.latest && !racks[it.side].includes(null)) { later(now + 0.32, (t) => { halt = t; banner.style.display = ""; }); return; }     // nowhere to put it
    later(now + 0.3, () => it.el.classList.add("busy"));
    later(now + 0.44, (t) => match(it, t));
    later(now + 0.84, (t) => store(it, t));
    later(now + 1.04, () => { if (cur.it === it) cur.it = null; });
  }
  /* things on the racks grow older; past five seconds they turn grey and are cleared away */
  function age(now) {
    ["cup", "candy"].forEach((side) => racks[side].forEach((p, i) => {
      if (!p || p.state !== "rack") return;
      const a = now - p.t0, text = Math.min(FRESH, Math.floor(a)) + "s", grey = a >= FRESH;
      if (text !== p.flag || grey !== !!p.grey) { p.flag = text; p.grey = p.warn = grey; F.redraw(p); }
      if (a >= FRESH + 0.5) p.el.style.opacity = Math.max(0, (FRESH + 0.9 - a) / 0.4);
      if (a >= FRESH + 0.9) { p.el.remove(); racks[side][i] = null; counts.cleared++; }
    }));
  }
  function tickTwo(dt, now) {
    spawn(now);
    items.forEach((it) => {
      const x = F.V * (now - it.born);
      if (x >= XE) { take(it, now); return; }
      F.put(it, P(x, laneY(it.side), F.TOP)); fadeIn(it, x);
    });
    items = items.filter((it) => it.state === "line");
    if (sc.fresh) age(now);
    cards = cards.filter((c) => {
      const x = LAND + F.V * (now - c.t0);
      if (x >= OUT1) { F.drop(c, P(OUT1, YM, F.TOP), ship, now); return false; }
      F.put(c, P(x, YM, F.TOP)); return true;
    });
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; sc = scene; rnd = kit.rng(31); F.reset();
    items = []; cards = []; todo = []; cur = { it: null }; hot = null; halt = null; banner = null;
    counts = { named: 0, pairs: 0, cleared: 0, replaced: 0 };
    if (sc.two) initTwo(); else initLookup();
    hands = F.clockHands(L.clock, CLOCK);
    k.focus([246, 24, 908, 760]);
    tick(0, 0);
  }

  function tick(dt, now) {
    if (halt != null) {                              // the racks are full: everything stands still, then the story starts again
      if (now - halt > 3.6) { k.restart(); return; }
      who.pose(now, dt, cur.it && cur.it.pos ? F.grip([cur.it.pos[0], cur.it.pos[1] - top(cur.it)], 9) : [null, null]); hands(now);
      return;
    }
    if (sc.two) tickTwo(dt, now); else tickLookup(dt, now);
    due(now);
    F.run(now);
    who.pose(now, dt, cur.it && cur.it.pos ? F.grip([cur.it.pos[0], cur.it.pos[1] - top(cur.it)], 9) : [null, null]);
    belts.forEach((b) => b.update(now)); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (!sc.two) return `${n(counts.named, "candy", "candies")} named`;
    const pairs = n(counts.pairs, "pair", "pairs");
    if (sc.latest) return `${pairs} · ${n(counts.replaced, "cup", "cups")} replaced`;
    if (sc.fresh) return `${pairs} · ${counts.cleared} cleared away`;
    const kept = racks.cup.filter(Boolean).length + racks.candy.filter(Boolean).length;
    return halt != null ? `${pairs} · the racks are full` : `${pairs} · ${kept} of ${2 * SIZE} places taken`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
