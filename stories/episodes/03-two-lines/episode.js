/* Story 03, The recipe sheet. It follows lab 03, streaming join.
   A join adds something to each candy from another place. Here that place is a recipe sheet next to the worker:
   one row for each flavor. For every candy the worker finds the row of its flavor, takes a sticky note with what
   the row says, and sticks it on the candy. The sheet is the table; it does not move and no candy is kept. */
(() => {
  const X1 = 10.6, BY = 3.9, WX = 4.6;       // the line ends at X1 and runs along y = BY; the worker stands at WX
  const LEAD = 0.36, CARRY = 0.7;             // a hand starts to reach LEAD seconds before the candy arrives; the candy is set down as far along as the line runs in CARRY seconds
  const CLOCK = [5.9, 2.85, 0.6];
  const RECIPE = { a: "SUGAR", b: "COCOA", c: "NUTS" };

  const SCENES = [
    { id: "sheet", label: "The recipe sheet",
      story: "A join adds something from another place. Here that place is the recipe sheet, with one row for each flavor. When a candy arrives, the worker finds the row of its flavor, takes a sticky note with what the row says, and sticks it on the candy. The candy leaves with its own tag and the note. The sheet never changes and no candy is kept, so there is nothing more to remember than the sheet. Engineers call this a join of a stream with a table." },
  ];

  let k, F, P, U, PAL, rnd, L, line, ship, hands, who, items, nextBorn, lastFlavor, counts, cur, hot, sheet, sticker;
  const later = (t, fn) => F.later(t, fn);
  const mid = (it) => [it.pos[0], it.pos[1] - it.r * U];           // the middle of a candy
  const plus = (p, g) => [p[0] + g[0], p[1] + g[1]];

  /* the sheet stands on two legs at the worker's side and faces the reader, like the worker does */
  function drawSheet() {
    const [fx, fy] = who.foot, x0 = fx + 23, x1 = fx + 117, y0 = fy - 103, y1 = fy - 24;
    sheet = { rows: F.FLAVORS.map((fl, i) => [x0 + 15, fy - 75 + i * 20]) };
    k.node(L.dolls, `<ellipse cx="${k.f((x0 + x1) / 2)}" cy="${k.f(fy + 1)}" rx="46" ry="6" fill="#5c5247" opacity=".13"/>`
      + k.edges([[[x0 + 12, y1], [x0 + 8, fy + 1]], [[x1 - 12, y1], [x1 - 8, fy + 1]]], { w: 2.2, over: 0 })
      + k.shape(`M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`, "#fdfaf1", 1.5)
      + `<text class="board-t" x="${x0 + 10}" y="${y0 + 17}" style="font-size:15px">RECIPE</text>`);
    sheet.el = k.node(L.dolls, "");
    rows();
  }
  function rows() {
    sheet.el.innerHTML = F.FLAVORS.map((fl, i) => {
      const [x, y] = sheet.rows[i];
      return `<g${hot === fl ? ' class="hot"' : ""}>${k.dot(x, y, 6.5, PAL[fl], 1.1)}<text class="sheet-r" x="${x + 13}" y="${y + 5.5}">${RECIPE[fl]}</text></g>`;
    }).join("");
  }

  function newCandy(born) {
    const light = rnd() < 0.36, grams = light ? 22 + Math.floor(rnd() * 9) : 31 + Math.floor(rnd() * 9);
    let fl = F.FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = F.FLAVORS[(F.FLAVORS.indexOf(fl) + 1) % 3];
    lastFlavor = fl;
    const it = F.thing(L.candy, { flavor: fl, small: light, flag: grams + " g" }); it.born = born; it.state = "line";
    items.push(it); return it;
  }
  const gap = () => 1.9 + rnd() * 1.8;            // uneven, and never closer than the worker can handle

  /* The moves for one candy, as a person makes them. The eyes go to the candy first. The left hand meets it as it arrives and
     lifts it in front of the belly. The eyes go to the sheet, the right hand goes to the row of this flavor, takes a note from it,
     brings it over and sticks it on. Then the left hand sets the candy down on the line a little further along. */
  function take(it, tp) {
    const r = it.r * U, g0 = F.grasp(0, r), H = who.hold, row = sheet.rows[F.FLAVORS.indexOf(it.flavor)];
    const tNote = tp + 0.62, tStick = tp + 0.96, tDown = tp + 1.12, tr = tDown + 0.3, born = tr - (WX - 0.1 + F.V * CARRY) / F.V;
    it.state = "hand"; cur.it = it; cur.next = null;
    F.give(it, who, 0); who.go(0, plus(H, g0), tp, 0.3);
    later(tp + 0.22, () => { cur.eye = [row[0] + 20, row[1]]; });
    later(tp + 0.3, () => { who.go(1, [row[0] - 3, row[1] + 2], tp + 0.3, 0.3); hot = it.flavor; rows(); });
    later(tNote, () => {                                                                       // the note comes off the row and goes with the hand
      const h = who.at(1), from = [row[0] + 30, row[1] + 9];
      sticker = { el: k.node(L.air, F.noteArt(RECIPE[it.flavor], 0)), off: [from[0] - h[0], from[1] - h[1]], t0: tNote, dur: 0.3 };
      who.go(1, [H[0] + r * 0.75, H[1] + r * 0.7], tNote, 0.3); cur.eye = null;
    });
    later(tp + 0.86, () => { if (hot === it.flavor) { hot = null; rows(); } });
    later(tStick, () => {                                                                      // pressed on under the candy's tag
      const st = sticker; sticker = null; it.busy = true;
      F.fly(st.el, st.pos, [it.pos[0], it.pos[1] + 41], tStick, 0.12, { done: () => { st.el.remove(); it.note = RECIPE[it.flavor]; F.redraw(it); counts.noted++; } });
    });
    later(tDown, () => {
      it.busy = false; who.go(1, null, tDown, 0.36);
      who.go(0, (t) => { const b = P(F.V * (t - born), BY, F.TOP); return [b[0] + g0[0], b[1] - r + g0[1]]; }, tDown, 0.3);
    });
    later(tr, () => { it.hand = null; it.state = "line"; it.born = born; it.clear = WX + 2.9; who.go(0, null, tr, 0.36); });
    later(tr + 0.25, () => { if (cur.it === it) cur.it = null; });
  }
  /* the worker keeps an eye on the next candy, and starts to reach a moment before it arrives */
  function attend(now) {
    const it = cur.it || cur.next || items.find((c) => c.state === "line" && !c.done);
    who.look(cur.eye || (it && it.pos && F.V * (now - it.born) > WX - 2.5 ? () => (it.pos ? mid(it) : null) : null));
    if (cur.it || cur.next || !it) return;
    const tp = it.born + (WX - 0.1) / F.V;
    if (tp - now > LEAD) return;
    cur.next = it; it.done = true;
    who.go(0, () => it.pos && plus(mid(it), F.grasp(0, it.r * U)), now, Math.max(0.12, tp - now));
    later(tp, () => take(it, tp));
  }

  function place(it, now) {
    if (it.state === "hand") { F.put(it, F.carried(it), { air: true, low: true, busy: it.busy }); return; }
    if (it.state !== "line") return;
    const x = F.V * (now - it.born), o = {};
    if (it.clear) { if (x < it.clear) o.low = true; else it.clear = null; }     // its tag and note stay low until it is clear of the worker and the sheet
    if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
    F.put(it, P(x, BY, F.TOP), o);
    it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
  }

  function init(kit) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; rnd = kit.rng(31); F.reset();
    items = []; lastFlavor = null; counts = { noted: 0 }; cur = { it: null, next: null, eye: null }; hot = null; sticker = null;
    F.room({ window: [1.2, 3.3], clock: CLOCK, door: 11.2 });
    L = { clock: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), air: k.layer(), arms: k.layer(), over: k.layer() };
    hands = F.clockHands(L.clock, CLOCK);
    line = F.belt(L.belt, 0, X1, BY);
    who = F.worker(L, { x: WX, y: BY - F.GAP, look: 2, coat: PAL.yellow });
    drawSheet();
    ship = F.bin(L, X1 + 0.4, BY - 0.7, 1.5, 1.4, 0.75, PAL.wood);
    k.labelLayer();
    k.setLabels([
      { title: "KITCHEN", note: "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.6) },
      { title: "WORKER", note: "finds the row for every candy", x: 56, y: 486, side: "start", to: [who.foot[0] - 14 * F.MAN, who.foot[1] - 62 * F.MAN] },
      { title: "RECIPE SHEET", note: "one row for each flavor, never changes", x: 1344, y: 150, side: "end", to: [who.foot[0] + 112, who.foot[1] - 100] },
      { title: "SHIPPING", note: "each candy leaves with its note", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ]);
    k.focus([246, 24, 908, 760]);
    // the line is already running when the story opens
    nextBorn = -X1 / F.V + 0.4;
    while (nextBorn <= 0) { const it = newCandy(nextBorn); if (-F.V * it.born >= WX - 0.1) { it.done = true; it.note = RECIPE[it.flavor]; F.redraw(it); } nextBorn += gap(); }
    tick(0, 0);
  }

  function tick(dt, now) {
    while (nextBorn <= now) { newCandy(nextBorn); nextBorn += gap(); }
    F.run(now);
    attend(now); who.pose(now, dt);
    if (sticker) {                                   // the note hangs from the hand that brings it
      const h = who.at(1), e = 1 - Math.min(1, Math.max(0, (now - sticker.t0) / sticker.dur));
      sticker.pos = [h[0] + sticker.off[0] * e, h[1] + 18 + (sticker.off[1] - 18) * e];
      sticker.el.setAttribute("transform", `translate(${k.f(sticker.pos[0])} ${k.f(sticker.pos[1])})`);
    }
    items.forEach((it) => place(it, now));
    items = items.filter((it) => it.state !== "out");
    line.update(now); hands(now);
  }

  const status = () => `${counts.noted} ${counts.noted === 1 ? "candy" : "candies"} with a note`;

  Story.start({ scenes: SCENES, init, tick, status });
})();
