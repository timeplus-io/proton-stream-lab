/* Story 02, The tally board.
   Counting needs memory: the board at the worker's side is the worker's state. The worker reads each candy, then chalks it up
   by hand, and wipes a column by hand when its time slot is over. The cards that leave are the results.
   Scenes: a card on a timer, a card for every change, a line per time slot, a late candy, and waiting a little. */
(() => {
  const BY = 3.9;                             // the lines run along y = BY
  const WX = 3.9, CX = WX - 0.1, IN1 = WX + 0.25;   // the worker stands at WX; a candy is picked up at CX; the candy line ends at IN1
  const OUT0 = 7.6, OUT1 = 10.6;              // the card line
  const SLOT = 5, PERIOD = 2;                 // seconds in a time slot; seconds between cards on a timer
  const LEAD = 0.3;                           // a hand starts to reach this long before the candy arrives
  const CLOCK = [2.1, 2.85, 0.6];
  const STEP = 0.3;                           // how far the worker shifts towards the board to write on it

  const SCENES = [
    { id: "tally", label: "Keep a tally", emit: "timer",
      story: "Counting needs memory. The worker looks at each candy, then chalks one more next to its flavor on the board. The line never ends, so the tally is never final. Instead, every two seconds a card goes out for each flavor with its total so far, changed or not. Engineers call the board state, and the counting an aggregation." },
    { id: "change", label: "Every change", emit: "change",
      story: "The same tally, a different habit. The worker does not wait for the clock. Each candy changes one number, and a card with that new number goes out at once. One candy in, one card out." },
    { id: "slots", label: "Time slots", win: true, delay: 0,
      story: "A time slot gives the count an end. Every candy carries a stamp with the second it was made, and the board has one column for each five-second slot. When the first candy of the next slot shows up, the old slot is complete: its counts go out once, one card for each flavor, and the worker wipes its column. Engineers call the slot a window." },
    { id: "late", label: "A late candy", win: true, delay: 0, disorder: true,
      story: "Some candies get stuck on the way and arrive late. Their stamp is red. A late candy still counts as long as its slot is open. If the slot on the stamp is already closed, its cards have gone out, so the candy goes in the bin." },
    { id: "wait", label: "Wait a little", win: true, delay: 2, disorder: true,
      story: "The same candies, with more patience. The worker keeps each slot open two seconds longer before sending its card, so fewer late candies end up in the bin. The price is that every card goes out two seconds later." },
  ];

  let k, F, P, U, PAL, rnd, sc, L, lineIn, lineOut, hopper, ship, lateBin, who, hands, bd, chalk;
  let items, cards, rows, counts, nextBorn, queue, slotAt, lastFlavor, wm, maxEt, nextEmit, cur, boardUntil;

  const later = (t, fn) => F.later(t, fn);
  const mid = (it) => [it.pos[0], it.pos[1] - it.r * U];           // the middle of a candy
  const plus = (p, g) => [p[0] + g[0], p[1] + g[1]];
  const sec = (t) => ":" + String(((Math.floor(t + 1e-6) % 60) + 60) % 60).padStart(2, "0");
  const colOf = (ws) => (sc.win ? (((ws / SLOT) % 2) + 2) % 2 : 0);
  const numAt = (col, j) => [bd.col[col], bd.row(j)];

  /* The board is a slate on two legs at the worker's side, close enough to write on. One line for each flavor.
     With time slots it has two columns, and the slots take them in turn. */
  function drawSlate() {
    const [fx, fy] = who.foot, x0 = fx + 27, x1 = x0 + 52, y0 = fy - 104, y1 = fy - 9;
    bd = { x0, x1, y0, dot: x0 + 9, col: [x0 + 24, x0 + 41], row: (j) => fy - 58 + j * 18 };
    k.node(L.board, `<ellipse cx="${k.f((x0 + x1) / 2)}" cy="${k.f(fy + 1)}" rx="30" ry="5" fill="#5c5247" opacity=".13"/>`
      + k.edges([[[x0 + 9, y1], [x0 + 6, fy + 1]], [[x1 - 9, y1], [x1 - 6, fy + 1]]], { w: 2.2, over: 0 })
      + k.shape(`M${x0 - 3} ${y0 - 3}L${x1 + 3} ${y0 - 3}L${x1 + 3} ${y1 + 3}L${x0 - 3} ${y1 + 3}Z`, PAL.wood, 1.5)
      + k.shape(`M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`, "#56655d", 1.1)
      + `<text class="slate-t" x="${(x0 + x1) / 2}" y="${y0 + 15}" text-anchor="middle">TALLY</text>`
      + F.FLAVORS.map((fl, j) => k.dot(bd.dot, bd.row(j), 5.5, PAL[fl], 1.1)).join(""));
    bd.el = k.node(L.board, "");
    chalk = k.node(L.arms, `<path class="ink" stroke-width="4.8" stroke-linecap="round"/><path stroke="#fdfaf1" stroke-width="2.8" stroke-linecap="round" fill="none"/>`);
  }
  function drawBoard(now) {
    const hand = who.at(1)[1];
    bd.el.innerHTML = [...rows.values()].map((r) => {
      const x = bd.col[r.col];
      let h = sc.win && !r.wipe ? `<text class="slate-h" x="${x}" y="${bd.y0 + 31}" text-anchor="middle">${r.label}</text>` : "";
      F.FLAVORS.forEach((fl, j) => {
        if (r.shown[fl] > 0 && !(r.wipe && bd.row(j) < hand + 3)) h += `<text class="slate-n${r.hot[fl] > now ? " hot" : ""}" x="${x}" y="${bd.row(j) + 5.5}" text-anchor="middle">${r.shown[fl]}</text>`;
      });
      return `<g${r.closing ? ' opacity=".5"' : ""}>${h}</g>`;
    }).join("");
  }
  function row(ws, label) {
    if (!rows.has(ws)) {
      const col = colOf(ws);
      [...rows.values()].filter((q) => q.col === col).forEach((q) => rows.delete(q.ws));
      rows.set(ws, { ws, col, label, n: { a: 0, b: 0, c: 0 }, shown: { a: 0, b: 0, c: 0 }, hot: { a: 0, b: 0, c: 0 } });
    }
    return rows.get(ws);
  }
  /* a card leaves the board and lands on the card line */
  function send(r, parts, now) {
    const from = numAt(r.col, F.FLAVORS.indexOf(parts[0].flavor));
    const c = F.card(L.cards, { head: sc.win ? sec(r.ws) : null, parts });
    L.cards.insertBefore(c.el, L.cards.firstChild);                 // a later card rides behind the one before it
    c.el.style.display = "none"; counts.cards++;
    F.fly(c.el, from, P(OUT0, BY, F.TOP), now, 0.6, { arc: 34, scale: [0.55, 1], it: c, done: () => { c.t0 = now + 0.6; cards.push(c); } });
  }
  /* one card for each flavor that has a count, one after another; the answer is when the last one leaves */
  function sendAll(r, of, t0, gap) {
    const list = F.FLAVORS.filter((fl) => r[of][fl] > 0);
    list.forEach((fl, j) => later(t0 + j * gap, (t) => send(r, [{ flavor: fl, n: r[of][fl] }], t)));
    return t0 + Math.max(0, list.length - 1) * gap;
  }

  /* the chalk is on the board: a moment later the number has changed */
  function chalkUp(r, fl, now) {
    later(now + 0.07, (t) => {
      r.shown[fl]++; r.hot[fl] = t + 0.6; boardUntil = t + 0.7; drawBoard(t);
      if (sc.emit === "change") later(t + 0.25, (u) => send(r, [{ flavor: fl, n: r.shown[fl] }], u));
    });
  }

  /* the worker has read the candy: count it, or find that it is too late */
  function decide(it, now) {
    if (!sc.win) { const r = row(0, ""); r.n[it.flavor]++; chalkUp(r, it.flavor, now); counts.counted++; return; }
    if (it.et < wm) { it.late = true; counts.late++; return; }
    const ws = Math.floor(it.et / SLOT) * SLOT, r = row(ws, sec(ws));
    r.n[it.flavor]++; chalkUp(r, it.flavor, now); counts.counted++; if (it.warn) counts.saved++;
    maxEt = Math.max(maxEt, it.et); wm = Math.max(wm, Math.floor((maxEt - sc.delay) / SLOT) * SLOT);
    [...rows.values()].filter((q) => !q.closing && q.ws + SLOT <= wm).forEach((q) => {      // these slots are complete
      q.closing = true; counts.closed++;
      later(now + 0.12, (t) => drawBoard(t));
      q.lastCard = sendAll(q, "n", now + 0.3, 0.55);
      later(now + 3.4, (t) => { if (rows.get(q.ws) === q) { rows.delete(q.ws); drawBoard(t); } });     // in case no hand was free to wipe it
    });
  }
  /* The moves for one candy, as a person makes them. The eyes go to the candy first. The left hand meets it as it arrives and
     lifts it in front of the belly, where its stamp is read. Then the worker turns to the board: a small step towards it,
     the eyes on the number, the right hand with the chalk on the board, and the number changes under the chalk.
     Meanwhile the left hand carries the candy over the box and lets go, or tosses it in the bin if it is too late.
     A column whose slot is over, and whose cards have gone out, is wiped with the same hand before it goes back down. */
  function take(it, tp) {
    const r = it.r * U, g0 = F.grasp(0, r), H = who.hold, [fx, fy] = who.foot, late = sc.win && it.et < wm;
    const ws = sc.win ? Math.floor(it.et / SLOT) * SLOT : 0, spot = numAt(colOf(ws), F.FLAVORS.indexOf(it.flavor)), pen = [spot[0] - 7, spot[1] + 4];
    const free = tp + (late ? 0.5 : 0.64);                                         // when the right hand has nothing more to write
    it.state = "hand"; cur.it = it; cur.next = null;
    F.give(it, who, 0); who.go(0, plus(H, g0), tp, 0.26);
    later(tp + 0.3, () => { it.busy = true; });
    if (late) later(tp + 0.4, (t) => decide(it, t));
    else {
      later(tp + 0.12, () => { who.step(STEP, tp + 0.12, 0.3); who.go(1, pen, tp + 0.12, 0.32); });
      later(tp + 0.26, () => { cur.eye = spot; });
      later(tp + 0.44, (t) => { decide(it, t); who.go(1, (u) => [pen[0] + 2.2 * Math.sin((u - t) * 63), pen[1] + 1.5 * Math.sin((u - t) * 39)], t, 0.05); });
    }
    later(tp + 0.5, () => {
      it.busy = false;
      if (it.late) {
        who.go(0, [fx - 31, fy - 27], tp + 0.5, 0.18);                             // a short swing towards the bin
        later(tp + 0.68, (t) => { it.hand = null; it.state = "out"; F.drop(it, it.pos, lateBin, t); who.go(0, null, t, 0.34); });
      } else {
        who.go(0, [fx + 3, fy - 17], tp + 0.5, 0.22);                              // over the box
        later(tp + 0.72, (t) => { it.hand = null; it.state = "out"; it.el.classList.add("air"); F.fly(it.el, it.pos, hopper.floor, t, 0.24, { it, done: () => it.el.remove() }); who.go(0, null, t, 0.3); });
      }
    });
    later(free, () => {
      const q = [...rows.values()].find((c) => c.closing && !c.wipe && c.lastCard <= free + 0.1);
      cur.eye = null;
      if (!q) { if (!late) { who.go(1, null, free, 0.3); who.step(0, free, 0.3); } return; }
      const x = bd.col[q.col] - 7, t1 = free + (late ? 0.26 : 0.14), t2 = t1 + 0.18;
      if (late) who.step(STEP, free, 0.26);
      who.go(1, [x, bd.row(0) - 6], free, t1 - free); cur.eye = [x, bd.row(1)];
      later(t1, () => { q.wipe = true; who.go(1, [x, bd.row(2) + 5], t1, t2 - t1); });
      later(t2, (t) => { rows.delete(q.ws); drawBoard(t); cur.eye = null; who.go(1, null, t2, 0.28); who.step(0, t2, 0.28); });
    });
    later(tp + 0.9, () => { if (cur.it === it) cur.it = null; });
  }
  /* the worker keeps an eye on the next candy, and starts to reach a moment before it arrives */
  function attend(now) {
    const it = cur.it || cur.next || items.find((c) => c.state === "line");
    who.look(cur.eye || (it && it.pos ? () => (it.pos ? mid(it) : null) : null));
    if (cur.next || !it || it.state !== "line") return;
    const tp = it.born + CX / F.V;
    if (tp - now > LEAD) return;
    cur.next = it;
    who.go(0, () => it.pos && plus(mid(it), F.grasp(0, it.r * U)), now, Math.max(0.12, tp - now));
    later(tp, () => take(it, tp));
  }

  /* ----- the candies. With time slots they follow a fixed pattern, so each slot has one clear late candy. ----- */
  function flavor() {
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    return (lastFlavor = fl);
  }
  function fillSlot(B) {
    const t1 = B + 0.15 + rnd() * 0.1, t2 = t1 + 1.2 + rnd() * 0.04, t3 = t2 + 1.2 + rnd() * 0.04, t4 = t3 + 1.2 + rnd() * 0.04;    // never faster than a pair of hands can take them
    const stuck = sc.disorder && B >= 5, veryStuck = sc.disorder && B >= 10 && (B / SLOT) % 2 === 0;
    queue.push({ born: t1, et: t1 });
    queue.push(stuck ? { born: t2, et: B - 0.4 - rnd() * 0.9, warn: true } : { born: t2, et: t2 });
    queue.push(sc.disorder ? { born: t3, et: t3 - 1.5, warn: true } : { born: t3, et: t3 });       // late, but its slot is still open
    if (t4 < B + SLOT - 0.2) queue.push(veryStuck ? { born: t4, et: B - 0.3 - rnd() * 0.6, warn: true } : { born: t4, et: t4 });
  }
  function nextCandy() {
    if (sc.win) {
      while (!queue.length) { fillSlot(slotAt); slotAt += SLOT; }
      return queue.shift();
    }
    const born = nextBorn; nextBorn += rnd() < 0.18 ? 1.25 + rnd() * 0.15 : 1.5 + rnd() * 1.9;
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
    const b0 = [bd.x1 - 3, bd.y0 + 5], head = [who.foot[0] - 14 * F.MAN, who.foot[1] - 62 * F.MAN];
    const list = [
      { title: "KITCHEN", note: sc.win ? "each candy gets a time stamp" : "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "TALLY BOARD", note: sc.win ? "one column for each time slot" : "the worker's memory, in chalk", x: 1344, y: 150, side: "end", to: b0 },
      { title: "COUNTER", note: "reads every candy, then chalks it up", x: 56, y: 520, side: "start", to: head },
      { title: "CARDS", note: sc.win ? "one per flavor for each finished slot" : sc.emit === "timer" ? "every flavor's total, every 2 seconds" : "one for every change", x: 1344, y: 650, side: "end", to: P(OUT1 - 0.6, BY + 0.45, F.TOP) },
    ];
    if (lateBin) list.push({ title: "TOO LATE", note: "its slot is already closed", x: 56, y: 680, side: "start", to: P(lateBin.x - 0.45, lateBin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; sc = scene; rnd = kit.rng(19); F.reset();
    items = []; cards = []; rows = new Map(); queue = []; ahead = null; lastFlavor = null; lateBin = null;
    counts = { counted: 0, cards: 0, closed: 0, late: 0, saved: 0 };
    wm = -Infinity; maxEt = -Infinity; nextEmit = PERIOD; cur = { it: null, next: null, eye: null }; boardUntil = 0;
    slotAt = -SLOT; nextBorn = -CX / F.V + 0.3;
    F.room({ clock: CLOCK, door: 11.2 });
    // the moving part of the sheet, back to front
    L = { clock: k.layer(), board: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), cards: k.layer(), arms: k.layer(), over: k.layer() };
    hands = F.clockHands(L.clock, CLOCK);
    lineIn = F.belt(L.belt, 0, IN1, BY); lineOut = F.belt(L.belt, OUT0 - 0.7, OUT1, BY);
    who = F.worker(L, { x: WX, y: BY - F.GAP, look: 1, coat: PAL.green });
    drawSlate();
    hopper = F.bin(L, WX + 0.45, BY - 0.6, 1.2, 1.2, 0.7, PAL.wood);
    ship = F.bin(L, OUT1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, PAL.wood);
    if (sc.disorder) lateBin = F.bin(L, WX - 1.5, BY + 1.3, 1.2, 1.0, 0.7, PAL.red);
    if (!sc.win) row(0, "");
    k.labelLayer(); labels();
    k.focus([246, 24, 908, 760]);
    drawBoard(0); tick(0, 0);
  }

  function tick(dt, now) {
    spawn(now);
    F.run(now);
    attend(now); who.pose(now, dt);
    { const h = who.shown(1), d = `M${k.f(h[0] + 2)} ${k.f(h[1] - 3)}L${k.f(h[0] + 6)} ${k.f(h[1] - 9)}`; chalk.children[0].setAttribute("d", d); chalk.children[1].setAttribute("d", d); }     // the chalk in the right hand
    if ([...rows.values()].some((q) => q.wipe)) drawBoard(now);
    items.forEach((it) => {
      if (it.state === "hand") { F.put(it, F.carried(it), { air: true, low: true, busy: it.busy }); return; }
      if (it.state !== "line") return;
      const x = F.V * (now - it.born);
      F.put(it, P(Math.min(x, CX), BY, F.TOP)); it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
    });
    items = items.filter((it) => it.state !== "out");
    if (sc.emit === "timer" && now >= nextEmit) { sendAll(rows.get(0), "shown", now, 0.6); nextEmit += PERIOD; }
    cards = cards.filter((c) => {
      const x = OUT0 + F.V * (now - c.t0);
      if (x >= OUT1) { F.drop(c, P(OUT1, BY, F.TOP), ship, now); return false; }
      F.put(c, P(x, BY, F.TOP)); return true;
    });
    if (boardUntil && now > boardUntil) { boardUntil = 0; drawBoard(now); }
    lineIn.update(now); lineOut.update(now); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (!sc.win) return `${n(counts.counted, "candy", "candies")} counted · ${n(counts.cards, "card", "cards")} sent`;
    if (sc.id === "slots") return `${n(counts.closed, "slot", "slots")} finished`;
    if (sc.id === "late") return `${counts.saved} late but counted · ${counts.late} too late`;
    return `${counts.saved} late but counted · ${counts.late} too late`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
