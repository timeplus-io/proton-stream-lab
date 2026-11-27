/* Story 02, The tally board. It follows lab 02, streaming aggregation, tab by tab.
   Counting needs memory: the slate at the worker's side is the worker's state, and the cards that leave are the results.
   Everything is done by hand and within reach. The worker sees a candy go by, then chalks it up on the slate.
   A card is written on the pad at the head of the card line and pushed onto the line. A column whose time slot is over
   is wiped by hand. The right hand does one thing at a time, so jobs wait their turn.
   Scenes: a card on a timer, a card for every change, a column per time slot, a late candy, and waiting a little. */
(() => {
  const BY = 3.9, WX = 3.9;                   // the lines run along y = BY; the worker stands at WX
  const SEE = WX - 0.45, GRAB = WX - 0.1, IN1 = WX + 0.2;        // where a candy is read, where a late one is taken off, where the candy line ends
  const PLATE = WX + 1.04, PAD = WX + 1.28, OUT0 = WX + 1.42, PUT = WX + 1.54, OUT1 = 10.6;   // the pad of blank cards stands on a plate at the head of the card line
  const VC = 1.8;                             // the card line runs a little faster, so cards do not crowd
  const SLOT = 5, PERIOD = 2;                 // seconds in a time slot; seconds between cards on a timer
  const CLOCK = [2.1, 2.85, 0.6];
  const GRIP = [2, -38];                      // where the hand holds a card, measured from the card's foot

  const SCENES = [
    { id: "tally", label: "Keep a tally", emit: "timer",
      story: "Counting needs memory. The worker sees each candy go by and chalks one more next to its flavor on the board. The line never ends, so the tally is never final. Instead, every two seconds the worker copies the board onto cards, one for each flavor with its total so far, changed or not, and sends them down the card line. Engineers call the board state, and the counting an aggregation." },
    { id: "change", label: "Every change", emit: "change",
      story: "The same tally, a different habit. The worker does not wait for the clock. Each candy changes one number, and the worker writes a card with that new number at once. One candy in, one card out." },
    { id: "slots", label: "Time slots", win: true, delay: 0,
      story: "A time slot gives the count an end. Every candy carries a stamp with the second it was made, and the board has one column for each five-second slot. When the first candy of the next slot shows up, the old slot is complete: the worker writes its counts on cards, one for each flavor, and then wipes its column. Engineers call the slot a window." },
    { id: "late", label: "A late candy", win: true, delay: 0, disorder: true,
      story: "Some candies get stuck on the way and arrive late. Their stamp is red. A late candy still counts as long as its slot is open. If the slot on the stamp is already closed, its cards are on their way, so the worker takes the candy off the line and throws it in the bin." },
    { id: "wait", label: "Wait a little", win: true, delay: 2, disorder: true,
      story: "The same candies, with more patience. The worker keeps each slot open two seconds longer before writing its cards, so fewer late candies end up in the bin. The price is that every card goes out two seconds later." },
  ];

  let k, F, P, U, PAL, rnd, sc, L, lineIn, lineOut, hopper, ship, lateBin, who, hands, bd, chalk;
  let items, cards, rows, counts, nextBorn, queue, slotAt, lastFlavor, wm, maxEt, nextEmit, cur, boardUntil, jobs, busy, held;

  const later = (t, fn) => F.later(t, fn);
  const mid = (it) => [it.pos[0], it.pos[1] - it.r * U];           // the middle of a candy
  const plus = (p, g) => [p[0] + g[0], p[1] + g[1]];
  const sec = (t) => ":" + String(((Math.floor(t + 1e-6) % 60) + 60) % 60).padStart(2, "0");
  const colOf = (ws) => (sc.win ? (((ws / SLOT) % 2) + 2) % 2 : 0);
  const numAt = (col, j) => [bd.col[col], bd.row(j)];
  const scribble = (p, t) => (u) => [p[0] + 2.2 * Math.sin((u - t) * 63), p[1] + 1.5 * Math.sin((u - t) * 39)];

  /* The board is a slate on two legs at the worker's side, close enough to write on. One line for each flavor, with the
     flavor's dot at the end of the line. With time slots it has two columns, and the slots take them in turn. */
  function drawSlate() {
    const [fx, fy] = who.foot, x0 = fx + 19, x1 = x0 + 50, y0 = fy - 124, y1 = fy - 38;
    bd = { x0, x1, y0, dot: x0 + 41, col: sc.win ? [x0 + 9, x0 + 26] : [x0 + 17], row: (j) => fy - 78 + j * 16 };
    k.node(L.board, `<ellipse cx="${k.f((x0 + x1) / 2)}" cy="${k.f(fy + 1)}" rx="30" ry="5" fill="#5c5247" opacity=".13"/>`
      + k.edges([[[x0 + 8, y1], [x0 + 5, fy + 1]], [[x1 - 8, y1], [x1 - 5, fy + 1]]], { w: 2.2, over: 0 })
      + k.shape(`M${x0 - 3} ${y0 - 3}L${x1 + 3} ${y0 - 3}L${x1 + 3} ${y1 + 3}L${x0 - 3} ${y1 + 3}Z`, PAL.wood, 1.5)
      + k.shape(`M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`, "#56655d", 1.1)
      + `<text class="slate-t" x="${(x0 + x1) / 2}" y="${y0 + 15}" text-anchor="middle">TALLY</text>`
      + F.FLAVORS.map((fl, j) => k.dot(bd.dot, bd.row(j), 5.5, PAL[fl], 1.1)).join(""));
    bd.el = k.node(L.board, "");
    chalk = k.node(L.arms, `<path class="ink" stroke-width="4.8" stroke-linecap="round"/><path stroke="#fdfaf1" stroke-width="2.8" stroke-linecap="round" fill="none"/>`);
  }
  /* what is on the slate: only what the chalk has written, and not what the hand has wiped */
  function drawBoard(now) {
    const hand = who.at(1)[1];
    bd.el.innerHTML = [...rows.values()].filter((r) => r.started).map((r) => {
      const x = bd.col[r.col];
      let h = sc.win && !r.wipe ? `<text class="slate-h" x="${x}" y="${bd.y0 + 31}" text-anchor="middle">${sec(r.ws)}</text>` : "";
      F.FLAVORS.forEach((fl, j) => {
        if (r.shown[fl] > 0 && !(r.wipe && bd.row(j) < hand + 3)) h += `<text class="slate-n${r.hot[fl] > now ? " hot" : ""}" x="${x}" y="${bd.row(j) + 5.5}" text-anchor="middle">${r.shown[fl]}</text>`;
      });
      return `<g${r.dim ? ' opacity=".5"' : ""}>${h}</g>`;
    }).join("");
  }
  function row(ws) {
    if (!rows.has(ws)) rows.set(ws, { ws, col: colOf(ws), n: { a: 0, b: 0, c: 0 }, shown: { a: 0, b: 0, c: 0 }, hot: { a: 0, b: 0, c: 0 } });
    return rows.get(ws);
  }

  /* ----- the right hand: one job at a time. A number to chalk up goes before cards that wait, because the candy is here now;
     but never before its column has been wiped for it. ----- */
  function enqueue(job, now) {
    if (job.kind === "write") {
      let i = -1; jobs.forEach((q, j) => { if (q.kind === "wipe" && q.col === job.col) i = j; });
      let j = i + 1; while (j < jobs.length && jobs[j].kind !== "card") j++;
      jobs.splice(j, 0, job);
    } else jobs.push(job);
    if (!busy) pump(now);
  }
  function pump(t0) {
    const job = jobs.shift();
    if (!job) { busy = false; cur.eye = null; who.go(1, null, t0, 0.32); return; }
    busy = true;
    const end = job.run(t0);
    later(end, () => pump(end));
  }
  /* chalk one more on the slate: the hand goes to the number, the chalk moves, and the number has changed */
  const writeJob = (r, fl) => ({ kind: "write", col: r.col, run(t0) {
    const spot = numAt(r.col, F.FLAVORS.indexOf(fl)), pen = [spot[0] - 7, spot[1] + 4];
    cur.eye = spot; who.go(1, pen, t0, 0.24);
    later(t0 + 0.24, (t) => who.go(1, scribble(pen, t), t, 0.05));
    later(t0 + 0.32, (t) => {
      r.started = true; r.shown[fl]++; r.hot[fl] = t + 0.6; boardUntil = t + 0.7; drawBoard(t);
      if (sc.emit === "change") enqueue(cardJob(r, "shown", fl), t);
    });
    return t0 + 0.46;
  } });
  /* write a card: a look at the number on the slate, the chalk on the top card of the pad, then the card is pushed onto the line */
  const cardJob = (r, of, fl) => ({ kind: "card", col: r.col, run(t0) {
    const n = r[of][fl], base = P(PAD, BY, F.TOP), at = plus(base, GRIP);
    if (!n) return t0;
    if (r.closing) { r.dim = true; drawBoard(t0); }
    cur.eye = numAt(r.col, F.FLAVORS.indexOf(fl)); who.go(1, [at[0], at[1] + 10], t0, 0.16);
    later(t0 + 0.1, () => { cur.eye = [base[0], base[1] - 24]; });
    later(t0 + 0.16, (t) => who.go(1, scribble([at[0], at[1] + 10], t), t, 0.05));
    later(t0 + 0.3, (t) => {
      const c = F.card(L.cards, { head: sc.win ? sec(r.ws) : "NOW", parts: [{ flavor: fl, n }] });
      L.cards.insertBefore(c.el, L.cards.firstChild);                 // a later card rides behind the one before it
      F.put(c, base); held = c; counts.cards++;
      who.go(1, plus(P(PUT, BY, F.TOP), GRIP), t, 0.14);
    });
    later(t0 + 0.44, () => { const c = held; held = null; c.t0 = t0 + 0.44 - (PUT - OUT0) / VC; cards.push(c); });
    return t0 + 0.44;
  } });
  /* wipe a column whose cards have gone out: the hand goes down it once */
  const wipeJob = (q) => ({ kind: "wipe", col: q.col, run(t0) {
    const x = bd.col[q.col] - 7;
    cur.eye = [x, bd.row(1)]; who.go(1, [x, bd.row(0) - 4], t0, 0.2);
    later(t0 + 0.2, () => { q.wipe = true; who.go(1, [x, bd.row(2) + 5], t0 + 0.2, 0.18); });
    later(t0 + 0.38, (t) => { rows.delete(q.ws); drawBoard(t); });
    return t0 + 0.4;
  } });

  /* the worker has read the candy: count it, or find that it is too late */
  function decide(it, now) {
    const fl = it.flavor;
    if (!sc.win) { const r = row(0); r.n[fl]++; counts.counted++; enqueue(writeJob(r, fl), now); return; }
    if (it.et < wm) { it.late = true; counts.late++; return; }
    const ws = Math.floor(it.et / SLOT) * SLOT, r = row(ws);
    r.n[fl]++; counts.counted++; if (it.warn) counts.saved++;
    maxEt = Math.max(maxEt, it.et); wm = Math.max(wm, Math.floor((maxEt - sc.delay) / SLOT) * SLOT);
    [...rows.values()].filter((q) => !q.closing && q.ws + SLOT <= wm).sort((a, b) => a.ws - b.ws).forEach((q) => {      // these slots are complete
      q.closing = true; counts.closed++;
      F.FLAVORS.forEach((f2) => { if (q.n[f2] > 0) enqueue(cardJob(q, "n", f2), now); });
      enqueue(wipeJob(q), now);
    });
    enqueue(writeJob(r, fl), now);
  }
  /* A candy is read as it goes by. One that is too late is taken off the line with the left hand and thrown in the bin. */
  function see(it, now) {
    it.seen = true; it.read = now + 0.3;
    decide(it, now);
    if (!it.late) return;
    const tp = it.born + GRAB / F.V, g0 = F.grasp(0, it.r * U), [fx, fy] = who.foot;
    cur.toss = it;
    who.go(0, () => it.pos && plus(mid(it), g0), now, Math.max(0.12, tp - now));
    later(tp, () => { it.state = "hand"; F.give(it, who, 0); who.go(0, [fx - 31, fy - 27], tp, 0.2); });
    later(tp + 0.2, (t) => { it.hand = null; it.state = "out"; F.drop(it, it.pos, lateBin, t); who.go(0, null, t, 0.36); });
    later(tp + 0.5, () => { if (cur.toss === it) cur.toss = null; });
  }
  /* the eyes: on a candy while it is read, else on the work of the right hand, else on the next candy */
  function attend(now) {
    const near = cur.toss || items.find((c) => c.state === "line" && c.pos && (c.read > now || (!c.seen && F.V * (now - c.born) > SEE - 0.5)));
    const next = near || items.find((c) => c.state === "line" && c.pos && !c.seen);
    who.look(near ? () => (near.pos ? mid(near) : null) : cur.eye || (next ? () => (next.pos ? mid(next) : null) : null));
  }

  /* ----- the candies. With time slots they follow a fixed pattern, so each slot shows what the scene is about. ----- */
  function flavor() {
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    return (lastFlavor = fl);
  }
  function fillSlot(B) {
    const t1 = B + 0.15 + rnd() * 0.1, t2 = t1 + 1.2 + rnd() * 0.04, t3 = t2 + 1.2 + rnd() * 0.04, t4 = t3 + 1.2 + rnd() * 0.04;
    const stuck = sc.disorder && B >= 5, veryStuck = sc.disorder && !sc.delay && B >= 10 && (B / SLOT) % 2 === 0;
    queue.push({ born: t1, et: t1 });
    queue.push(stuck ? { born: t2, et: B - 0.4 - rnd() * 0.9, warn: true } : { born: t2, et: t2 });      // stuck since the slot before
    queue.push({ born: t3, et: t3 });
    queue.push(veryStuck ? { born: t4, et: B - 0.3 - rnd() * 0.6, warn: true } : sc.disorder ? { born: t4, et: t4 - 1.5, warn: true } : { born: t4, et: t4 });   // late, but its slot is still open
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
      if (ahead.born > -SEE / F.V + 0.15) {
        const it = F.thing(L.candy, { flavor: flavor(), flag: sc.win ? sec(ahead.et) : null, warn: ahead.warn });
        it.born = ahead.born; it.et = ahead.et; it.state = "line"; items.push(it);
      } else flavor();
      ahead = null;
    }
  }

  function labels() {
    const head = [who.foot[0] - 14 * F.MAN, who.foot[1] - 62 * F.MAN];
    const list = [
      { title: "KITCHEN", note: sc.win ? "each candy gets a time stamp" : "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "TALLY BOARD", note: sc.win ? "one column for each time slot" : "the worker's memory, in chalk", x: 1344, y: 150, side: "end", to: [bd.x1 - 3, bd.y0 + 5] },
      { title: "COUNTER", note: "sees a candy, chalks it up, writes the cards", x: 56, y: 520, side: "start", to: head },
      { title: "CARDS", note: sc.win ? "one per flavor for each finished slot" : sc.emit === "timer" ? "every flavor's total, every 2 seconds" : "one for every change", x: 1344, y: 650, side: "end", to: P(OUT1 - 0.6, BY + 0.45, F.TOP) },
    ];
    if (lateBin) list.push({ title: "TOO LATE", note: "its slot is already closed", x: 56, y: 680, side: "start", to: P(lateBin.x - 0.45, lateBin.y + 0.5, 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; sc = scene; rnd = kit.rng(19); F.reset();
    items = []; cards = []; rows = new Map(); queue = []; ahead = null; lastFlavor = null; lateBin = null; jobs = []; busy = false; held = null;
    counts = { counted: 0, cards: 0, closed: 0, late: 0, saved: 0 };
    wm = -Infinity; maxEt = -Infinity; nextEmit = PERIOD; cur = { eye: null, toss: null }; boardUntil = 0;
    slotAt = -SLOT; nextBorn = -SEE / F.V + 0.3;
    F.room({ clock: CLOCK, door: 11.2 });
    // the moving part of the sheet, back to front
    L = { clock: k.layer(), board: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), over: k.layer(), pad: k.layer(), cards: k.layer(), arms: k.layer(), front: k.layer() };
    hands = F.clockHands(L.clock, CLOCK);
    lineIn = F.belt(L.belt, 0, IN1, BY); lineOut = F.belt(L.belt, OUT0, OUT1, BY, VC);
    k.node(L.belt, k.box(PLATE, BY - F.BW / 2, F.TOP - 0.28, OUT0 - PLATE, F.BW, 0.28, PAL.wood));
    who = F.worker(L, { x: WX, y: BY - F.GAP, look: 1, coat: PAL.green });
    drawSlate();
    hopper = F.bin(L, WX + 0.22, BY - 0.5, 0.78, 1.0, 0.7, PAL.wood);
    ship = F.bin({ under: L.under, over: L.front }, OUT1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, PAL.wood);
    if (sc.disorder) lateBin = F.bin(L, WX - 1.5, BY + 1.3, 1.2, 1.0, 0.7, PAL.red);
    // the pad: blank cards, one behind the other
    { const [x, y] = P(PAD, BY, F.TOP), sheet = (d) => k.shape(`M${x - 22 + d} ${y - 48 - d}L${x + 22 + d} ${y - 48 - d}L${x + 22 + d} ${y - 4 - d}L${x - 22 + d} ${y - 4 - d}Z`, PAL.white, 1.2);
      k.node(L.pad, sheet(4) + sheet(2) + sheet(0)); }
    if (!sc.win) row(0);
    k.labelLayer(); labels();
    k.focus([246, 24, 908, 760]);
    drawBoard(0); tick(0, 0);
  }

  function tick(dt, now) {
    spawn(now);
    F.run(now);
    if (sc.emit === "timer" && now >= nextEmit) { F.FLAVORS.forEach((fl) => enqueue(cardJob(rows.get(0), "shown", fl), now)); nextEmit += PERIOD; }
    items.forEach((it) => {
      if (it.state !== "line") return;
      const x = F.V * (now - it.born);
      if (!it.seen && x >= SEE) see(it, now);
      if (x >= IN1) {                                             // off the end of the line, into the box
        it.state = "out"; it.el.classList.add("air");
        F.fly(it.el, P(IN1, BY, F.TOP), hopper.floor, now, 0.34, { arc: 7, it, done: () => it.el.remove() });
        return;
      }
      F.put(it, P(x, BY, F.TOP), { busy: it.read > now, low: it.seen });      // near the worker its stamp hangs low, clear of the worker's face it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
    });
    attend(now); who.pose(now, dt);
    items.forEach((it) => { if (it.state === "hand") F.put(it, F.carried(it), { air: true, low: true }); });
    items = items.filter((it) => it.state !== "out");
    if (held) { const h = who.at(1); F.put(held, [h[0] - GRIP[0], h[1] - GRIP[1]]); }
    { const h = who.shown(1), d = `M${k.f(h[0] + 2)} ${k.f(h[1] - 3)}L${k.f(h[0] + 6)} ${k.f(h[1] - 9)}`; chalk.children[0].setAttribute("d", d); chalk.children[1].setAttribute("d", d); }     // the chalk in the right hand
    cards = cards.filter((c) => {
      const x = OUT0 + VC * (now - c.t0);
      if (x >= OUT1) { F.drop(c, P(OUT1, BY, F.TOP), ship, now); return false; }
      F.put(c, P(x, BY, F.TOP)); return true;
    });
    if ((boardUntil && now > boardUntil) || [...rows.values()].some((q) => q.wipe)) { if (now > boardUntil) boardUntil = 0; drawBoard(now); }
    lineIn.update(now); lineOut.update(now); hands(now);
  }

  function status() {
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    if (!sc.win) return `${n(counts.counted, "candy", "candies")} counted · ${n(counts.cards, "card", "cards")} sent`;
    if (sc.id === "slots") return `${n(counts.closed, "slot", "slots")} finished`;
    return `${counts.saved} late but counted · ${counts.late} too late`;
  }

  Story.start({ scenes: SCENES, init, tick, status });
})();
