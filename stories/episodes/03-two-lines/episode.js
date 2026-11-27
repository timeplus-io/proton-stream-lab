/* Story 03, The recipe sheet. It follows lab 03, streaming join.
   A join adds something to each candy from another place. Here that place is a recipe sheet next to the worker:
   one row for each flavor. For every candy the worker finds the row of its flavor, takes a sticky note with what
   the row says, and sticks it on the candy. The sheet is the table; it does not move and no candy is kept. */
(() => {
  const X1 = 10.6, BY = 3.9, WX = 4.6;       // the line ends at X1 and runs along y = BY; the worker stands at WX
  const HOLD = 1.3, CARRY = 0.8;              // seconds a candy is in hand; the line moves it on as if it had been CARRY seconds
  const CLOCK = [5.9, 2.85, 0.6];
  const RECIPE = { a: "SUGAR", b: "COCOA", c: "NUTS" };

  const SCENES = [
    { id: "sheet", label: "The recipe sheet",
      story: "A join adds something from another place. Here that place is the recipe sheet, with one row for each flavor. When a candy arrives, the worker finds the row of its flavor, takes a sticky note with what the row says, and sticks it on the candy. The candy leaves with its own tag and the note. The sheet never changes and no candy is kept, so there is nothing more to remember than the sheet. Engineers call this a join of a stream with a table." },
  ];

  let k, F, P, U, PAL, rnd, L, line, ship, hands, who, items, todo, nextBorn, lastFlavor, counts, cur, hot, sheet, sticker;
  const ease = (u) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  const later = (t, fn) => todo.push({ t, fn });

  /* the sheet stands on two legs at the worker's side and faces the reader, like the worker does */
  function drawSheet() {
    const [fx, fy] = who.foot, x0 = fx + 24, x1 = fx + 118, y0 = fy - 108, y1 = fy - 28;
    sheet = { rows: F.FLAVORS.map((fl, i) => [x0 + 15, fy - 80 + i * 20]) };
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
  const gap = () => 1.75 + rnd() * 1.9;            // uneven, and never closer than the worker can handle

  /* the worker has the candy at the chest: find the row, take a note from it, stick it on */
  function lookUp(it, t0) {
    const i = F.FLAVORS.indexOf(it.flavor), row = sheet.rows[i];
    cur.reach = null;
    later(t0 + 0.3, () => { hot = it.flavor; rows(); cur.reach = [row[0] + 4, row[1]]; });          // the free hand goes to the row
    later(t0 + 0.55, (t) => {
      sticker = { el: k.node(L.air, F.noteArt(RECIPE[it.flavor], 9)), pos: [row[0] + 30, row[1]] };
      const c = who.chest(it.r * U), to = [c[0], c[1] + 32];                                           // under the candy, where its tag hangs
      F.fly(sticker.el, sticker.pos, to, t, 0.3, { arc: -6, it: sticker, done: () => { sticker.el.remove(); sticker = null; cur.reach = null; it.note = RECIPE[it.flavor]; F.redraw(it); counts.noted++; } });
    });
    later(t0 + 1.0, () => { if (hot === it.flavor) { hot = null; rows(); } });
  }

  function place(it, now) {
    if (it.state !== "line") return;
    let x = F.V * (now - it.born), p, o = {};
    if (!it.done && x >= WX - 0.1) { it.done = true; it.t0 = now; cur.it = it; lookUp(it, now); }
    if (it.t0 != null) {
      const u = now - it.t0, from = P(WX - 0.1, BY, F.TOP), to = P(WX - 0.1 + F.V * CARRY, BY, F.TOP), c = who.chest(it.r * U);
      if (u >= HOLD) { it.born = now - (WX - 0.1 + F.V * CARRY) / F.V; it.t0 = null; cur.it = null; x = F.V * (now - it.born); it.clear = x + 0.75; }   // back on the line, a little later than it would have been
      else {
        const up = ease(u / 0.25), down = ease((u - (HOLD - 0.25)) / 0.25), q = u < HOLD / 2 ? [from[0] + (c[0] - from[0]) * up, from[1] + (c[1] - from[1]) * up] : [c[0] + (to[0] - c[0]) * down, c[1] + (to[1] - c[1]) * down];
        p = [q[0], q[1] - 5 * Math.sin(Math.PI * (u < HOLD / 2 ? up : down))];
        o = { air: u > 0.05 && u < HOLD - 0.05, low: u > 0.05, busy: u > 0.55 && u < 0.95 };
      }
    }
    if (it.t0 == null && it.clear) { if (x < it.clear) o.low = true; else it.clear = null; }
    if (x >= X1) { it.state = "out"; F.drop(it, P(X1, BY, F.TOP), ship, now); return; }
    F.put(it, p || P(x, BY, F.TOP), o);
    it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
  }

  function init(kit) {
    k = kit; F = Factory(kit); P = kit.P; U = kit.U; PAL = kit.PAL; rnd = kit.rng(31); F.reset();
    items = []; todo = []; lastFlavor = null; counts = { noted: 0 }; cur = { it: null, reach: null }; hot = null; sticker = null;
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
    items.forEach((it) => place(it, now));
    items = items.filter((it) => it.state === "line");
    const due = todo.filter((j) => j.t <= now); todo = todo.filter((j) => j.t > now); due.sort((a, b) => a.t - b.t).forEach((j) => j.fn(now));
    F.run(now);
    // hands: both on the candy, except that the hand on the sheet's side goes to the row and brings the note over
    let h = [null, null];
    const it = cur.it || items.find((c) => c.state === "line" && !c.done && F.V * (now - c.born) > WX - 0.4);
    if (it && it.pos) h = F.grip([it.pos[0], it.pos[1] - it.r * U], it.r * U * 0.85);
    if (sticker) h[1] = [sticker.pos[0] - 4, sticker.pos[1] - 8]; else if (cur.reach) h[1] = cur.reach;
    who.pose(now, dt, h);
    line.update(now); hands(now);
  }

  const status = () => `${counts.noted} ${counts.noted === 1 ? "candy" : "candies"} with a note`;

  Story.start({ scenes: SCENES, init, tick, status });
})();
