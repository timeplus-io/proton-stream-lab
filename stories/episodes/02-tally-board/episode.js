/* Story 02, The tally board.
   Counting needs memory: the board on the wall is the worker's state. The cards that leave are the results.
   Scenes: a card on a timer, a card for every change, a line per time slot, a late candy, and waiting a little. */
(() => {
  const BY = 3.9, WY = 2.95;                  // the lines run along y = BY; the worker stands at y = WY
  const CX = 3.8, IN1 = 4.45, WX = 4.6;       // a candy is picked up at CX; the candy line ends at IN1; the worker stands at WX
  const OUT0 = 7.9, OUT1 = 10.6;              // the card line
  const SLOT = 5, PERIOD = 2;                 // seconds in a time slot; seconds between cards on a timer
  const CLOCK = [2.1, 2.85, 0.6];
  const BD = { x: 4.3, w: 5.2, z: 3.3, h: 1.75 };   // the board on the back wall

  const SCENES = [
    { id: "tally", label: "Keep a tally", emit: "timer",
      story: "Counting needs memory. The worker keeps a tally of each flavor on the board. The line never ends, so the tally is never final. Instead, every two seconds the worker sends out a card with the totals so far. Engineers call the board state, and the counting an aggregation." },
    { id: "change", label: "Every change", emit: "change",
      story: "The same tally, a different habit. The worker does not wait for the clock. Each candy changes one number, and a card with that new number goes out at once. One candy in, one card out." },
    { id: "slots", label: "Time slots", win: true, delay: 0,
      story: "A time slot gives the count an end. Every candy carries a stamp with the second it was made, and the board keeps one line for each five-second slot. When the first candy of the next slot shows up, the old slot is complete: its card goes out once and its line is wiped. Engineers call the slot a window." },
    { id: "late", label: "A late candy", win: true, delay: 0, disorder: true,
      story: "Some candies get stuck on the way and arrive late. Their stamp is red. If the slot on the stamp is already closed, the candy cannot be counted any more, so it goes in the bin." },
    { id: "wait", label: "Wait a little", win: true, delay: 2, disorder: true,
      story: "The same candies, with more patience. The worker keeps each slot open two seconds longer before sending its card, so most late candies still get counted. The price is that every card goes out two seconds later." },
  ];

  let k, F, P, U, PAL, rnd, sc, L, lineIn, lineOut, hopper, ship, lateBin, who, hands;
  let items, cards, todo, rows, counts, nextBorn, queue, slotAt, lastFlavor, wm, maxEt, nextEmit, cur, boardUntil;

  const later = (t, fn) => todo.push({ t, fn });
  const sec = (t) => ":" + String(((Math.floor(t + 1e-6) % 60) + 60) % 60).padStart(2, "0");
  const visible = () => [...rows.values()].sort((a, b) => a.ws - b.ws).slice(-2);
  const rowAt = (i, px, dy = 0) => P(BD.x + (14 + px) / U, 0, BD.z - (56 + i * 31 + dy) / U);

  function drawBoard(now) {
    L.board.innerHTML = visible().map((r, i) => {
      const p = rowAt(i, 0);
      let h = `<text class="board-r" x="0" y="0">${r.label}</text>`;
      F.FLAVORS.forEach((fl, j) => { const x = 118 + j * 50; h += k.dot(x, -7, 7.5, PAL[fl], 1.1) + `<text class="board-n${r.hot[fl] > now ? " hot" : ""}" x="${x + 12}" y="2">${r.shown[fl]}</text>`; });
      return `<g transform="matrix(${k.CS} ${k.SN} 0 1 ${k.f(p[0])} ${k.f(p[1])})"${r.closing ? ' opacity=".4"' : ""}>${h}</g>`;
    }).join("");
  }
  function row(ws, label) {
    if (!rows.has(ws)) rows.set(ws, { ws, label, n: { a: 0, b: 0, c: 0 }, shown: { a: 0, b: 0, c: 0 }, hot: { a: 0, b: 0, c: 0 } });
    return rows.get(ws);
  }
  /* a card leaves the board and lands on the card line */
  function send(r, parts, now) {
    const i = Math.max(0, visible().indexOf(r)), c = F.card(L.cards, { head: sc.win ? r.label : null, parts });
    c.el.style.display = "none";
    F.fly(c.el, rowAt(i, 130, 6), P(OUT0, BY, F.TOP), now, 0.6, { arc: 34, scale: [0.55, 1], it: c, done: () => { c.t0 = now + 0.6; cards.push(c); } });
    cur.card = c; cur.cardUntil = now + 0.4; counts.cards++;
  }
  const filled = (r, of = "shown") => F.FLAVORS.filter((fl) => r[of][fl] > 0).map((fl) => ({ flavor: fl, n: r[of][fl] }));

  /* +1 travels from the candy to its number, and the number changes when it lands */
  function plusOne(r, fl, now) {
    const i = Math.max(0, visible().indexOf(r)), el = k.node(L.cards, `<text class="plus" text-anchor="middle">+1</text>`);
    F.fly(el, [who.held[0], who.held[1] - 30], rowAt(i, 118 + F.FLAVORS.indexOf(fl) * 50 + 18, 6), now, 0.32, { arc: 10, done: () => el.remove() });
    later(now + 0.32, (t) => {
      r.shown[fl]++; r.hot[fl] = t + 0.6; boardUntil = t + 0.7; drawBoard(t);
      if (sc.emit === "change") send(r, [{ flavor: fl, n: r.shown[fl] }], t);
    });
  }

  /* the worker has the candy in hand: count it, or find that it is too late */
  function decide(it, now) {
    if (!sc.win) { const r = row(0, "so far"); r.n[it.flavor]++; plusOne(r, it.flavor, now); counts.counted++; return; }
    if (it.et < wm) { it.late = true; counts.late++; return; }
    const ws = Math.floor(it.et / SLOT) * SLOT, r = row(ws, `${sec(ws)} – ${sec(ws + SLOT)}`);
    r.n[it.flavor]++; plusOne(r, it.flavor, now); counts.counted++; if (it.warn) counts.saved++;
    maxEt = Math.max(maxEt, it.et); wm = Math.max(wm, Math.floor((maxEt - sc.delay) / SLOT) * SLOT);
    [...rows.values()].filter((q) => !q.closing && q.ws + SLOT <= wm).forEach((q) => {      // these slots are complete
      q.closing = true; counts.closed++;
      later(now + 0.45, (t) => { drawBoard(t); send(q, filled(q, "n"), t); });
      later(now + 1.05, (t) => { rows.delete(q.ws); drawBoard(t); });
    });
  }
  function pick(it, now) {
    it.state = "hand"; cur.it = it; it.el.classList.add("air");
    F.fly(it.el, P(CX, BY, F.TOP), who.held, now, 0.28, { arc: 6, it });
    later(now + 0.32, () => it.el.classList.add("busy"));
    later(now + 0.46, (t) => decide(it, t));
    later(now + 0.66, (t) => { it.el.classList.remove("busy"); F.drop(it, who.held, it.late ? lateBin : hopper, t); });
    later(now + 0.86, () => { if (cur.it === it) cur.it = null; });
  }

  /* ----- the candies. With time slots they follow a fixed pattern, so each slot has one clear late candy. ----- */
  function flavor() {
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    return (lastFlavor = fl);
  }
  function fillSlot(B) {
    const t1 = B + 0.15 + rnd() * 0.4, t2 = t1 + 1.0 + rnd() * 0.4, t3 = t2 + 1.0 + rnd() * 0.3, t4 = t3 + 1.0 + rnd() * 0.3;
    const stuck = sc.disorder && B >= 5, veryStuck = sc.disorder && B >= 10 && (B / SLOT) % 2 === 0;
    queue.push({ born: t1, et: t1 });
    queue.push(stuck ? { born: t2, et: B - 0.4 - rnd() * 0.9, warn: true } : { born: t2, et: t2 });
    queue.push({ born: t3, et: t3 });
    if (t4 < B + SLOT - 0.2) queue.push(veryStuck ? { born: t4, et: B - 0.3 - rnd() * 0.6, warn: true } : { born: t4, et: t4 });
  }
  function nextCandy() {
    if (sc.win) {
      while (!queue.length) { fillSlot(slotAt); slotAt += SLOT; }
      return queue.shift();
    }
    const born = nextBorn; nextBorn += rnd() < 0.18 ? 1.0 + rnd() * 0.2 : 1.4 + rnd() * 1.9;
    return { born };
  }
  let ahead = null;
  function spawn(now) {
    for (;;) {
      if (!ahead) ahead = nextCandy();
      if (ahead.born > now) return;
      if (ahead.born > -CX / F.V + 0.15) {
        const it = F.thing(L.candy, { flavor: flavor(), flag: sc.win ? sec(ahead.et) : null, warn: ahead.warn });
        it.born = ahead.born; it.et = ahead.et; it.state = "line"; items.push(it);
      } else flavor();
      ahead = null;
    }
  }

  function labels() {
    const b0 = P(BD.x + BD.w - 0.5, 0, BD.z - 0.3), head = [who.foot[0] + 15 * F.MAN, who.foot[1] - 58 * F.MAN];
    const list = [
      { title: "KITCHEN", note: sc.win ? "each candy gets a time stamp" : "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "TALLY BOARD", note: sc.win ? "one line for each time slot" : "the worker's memory", x: 1344, y: 150, side: "end", to: b0 },
      { title: "COUNTER", note: "picks up every candy and counts it", x: 56, y: 520, side: "start", to: head },
      { title: "CARDS", note: sc.win ? "one for each finished slot" : sc.emit === "timer" ? "the totals so far, every 2 seconds" : "one for every change", x: 1344, y: 650, side: "end", to: P(OUT1 - 0.6, BY + 0.45, F.TOP) },
    ];
    if (lateBin) list.push({ title: "TOO LATE", note: "its slot is already closed", x: 56, y: 680, side: "start", to: P(lateBin.x - 0.45, lateBin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; sc = scene; rnd = kit.rng(19); F.reset();
    items = []; cards = []; todo = []; rows = new Map(); queue = []; ahead = null; lastFlavor = null; lateBin = null;
    counts = { counted: 0, cards: 0, closed: 0, late: 0, saved: 0 };
    wm = -Infinity; maxEt = -Infinity; nextEmit = PERIOD; cur = { it: null, card: null, cardUntil: 0 }; boardUntil = 0;
    slotAt = -SLOT; nextBorn = -CX / F.V + 0.3;
    F.room({ clock: CLOCK, door: 11.2 });
    k.still(F.panel(BD.x, BD.x + BD.w, BD.z - BD.h, BD.z, "#fdfaf1", 1.7) + `<text class="board-t" transform="${F.onBack(BD.x + 14 / U, BD.z - 25 / U)}">TALLY</text>`);
    // the moving part of the sheet, back to front
    L = { clock: k.layer(), board: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), cards: k.layer(), arms: k.layer(), over: k.layer() };
    hands = F.clockHands(L.clock, CLOCK);
    lineIn = F.belt(L.belt, 0, IN1, BY); lineOut = F.belt(L.belt, OUT0 - 0.7, OUT1, BY);
    who = F.worker(L, { x: WX, y: WY, look: 1, coat: PAL.green });
    hopper = F.bin(L, 5.0, BY - 0.6, 1.2, 1.2, 0.75, PAL.wood);
    ship = F.bin(L, OUT1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, PAL.wood);
    if (sc.disorder) lateBin = F.bin(L, 3.1, BY + 1.3, 1.2, 1.0, 0.7, PAL.red);
    if (!sc.win) row(0, "so far");
    k.labelLayer(); labels();
    k.focus([246, 24, 908, 760]);
    drawBoard(0); tick(0, 0);
  }

  function tick(dt, now) {
    spawn(now);
    items.forEach((it) => {
      if (it.state !== "line") return;
      const x = F.V * (now - it.born);
      if (x >= CX) { pick(it, now); return; }
      F.put(it, P(x, BY, F.TOP)); it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
    });
    items = items.filter((it) => it.state === "line");
    const due = todo.filter((j) => j.t <= now); todo = todo.filter((j) => j.t > now); due.sort((a, b) => a.t - b.t).forEach((j) => j.fn(now));
    if (sc.emit === "timer" && now >= nextEmit) { const r = rows.get(0), parts = filled(r); if (parts.length) send(r, parts, now); nextEmit += PERIOD; }
    cards = cards.filter((c) => {
      const x = OUT0 + F.V * (now - c.t0);
      if (x >= OUT1) { F.drop(c, P(OUT1, BY, F.TOP), ship, now); return false; }
      F.put(c, P(x, BY, F.TOP)); return true;
    });
    F.run(now);
    if (boardUntil && now > boardUntil) { boardUntil = 0; drawBoard(now); }
    let h = [null, null];
    if (cur.it && cur.it.pos) h = F.grip([cur.it.pos[0], cur.it.pos[1] - cur.it.r * U], 9);
    else if (cur.card && now < cur.cardUntil && cur.card.pos) h = [null, [cur.card.pos[0], cur.card.pos[1] - 18]];
    who.pose(now, dt, h);
    lineIn.update(now); lineOut.update(now); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (!sc.win) return `${n(counts.counted, "candy", "candies")} counted · ${n(counts.cards, "card", "cards")} sent`;
    if (sc.id === "slots") return `${n(counts.closed, "slot", "slots")} finished`;
    if (sc.id === "late") return `${n(counts.closed, "slot", "slots")} finished · ${counts.late} too late`;
    return `${counts.saved} late but counted · ${counts.late} too late`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
