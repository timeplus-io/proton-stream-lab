/* Story 01, The candy line.
   A stream is a line that never ends, an event is one candy, an operator is a worker on the line.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const V = 1.3;                                   // belt speed, room units per second
  const FX = 13, FY = 6.4, WH = 3.7;              // the room: floor size and wall height
  const X1 = 10.6, BY = 3.9, BW = 1.0, TOP = 0.9;  // the belt: from the hatch at x = 0 to X1, centred on y = BY
  const WY = 2.95, MAN = 1.15;                     // workers stand just behind the belt; MAN is their size
  const R = 0.3, R_SMALL = 0.18;
  const FLAVORS = ["a", "b", "c"];
  const PUSH = 0.6, FALL = 0.45, POP = 0.4, SLAT = 0.6;
  const CLOCK = [5.9, 2.85, 0.6];                  // on the back wall: x, height, radius

  const SCENES = [
    { id: "line", label: "The line", stations: [{ kind: "watch", x: 5.2 }],
      story: "A stream is like this candy line. It has no last candy. Each one rolls out of the kitchen at its own moment, and the clock on the wall keeps the time. Nobody waits for the batch to be finished, because it never is." },
    { id: "inspector", label: "The inspector", stations: [{ kind: "filter", x: 5.2 }],
      story: "A worker on the line looks at one candy at a time and decides on the spot. Big enough stays on the line. Too small goes in the bin. The worker needs no memory of the candies before. Engineers call this a filter." },
    { id: "wrapper", label: "The wrapper", stations: [{ kind: "wrap", x: 5.2 }],
      story: "This worker changes every candy. One raw candy comes in, one wrapped candy goes out, and the line never stops for it. Engineers call this a transform." },
    { id: "both", label: "The whole line", stations: [{ kind: "filter", x: 3.4 }, { kind: "wrap", x: 7.4 }],
      story: "Workers stand in a row and each one does a small job. Raw candy goes in on the left and finished candy comes out on the right, a moment after it arrived. That is stream processing: the work happens while things move." },
  ];

  let k, PAL, P, U, rnd, sc, L, items, stations, nextBorn, smallRun, lastFlavor, counts, serial, slats, hands;

  /* ----- the room, drawn once ----- */
  function room() {
    const wallP = (y, z) => P(0, y, z), backP = (x, z) => P(x, 0, z);
    let h = "";
    h += k.box(-0.3, -0.3, -0.55, FX + 0.3, FY + 0.3, 0.37, PAL.base);
    h += k.box(-0.3, -0.3, -0.18, FX + 0.3, FY + 0.3, 0.18, k.darker(PAL.floor, 0.12), { top: PAL.floor });
    const joints = [];
    for (let x = 1; x < FX; x++) joints.push([P(x, 0), P(x, FY)]);
    for (let y = 1; y < FY; y++) joints.push([P(0, y), P(FX, y)]);
    h += k.edges(joints, { w: 0.7, op: 0.22, over: 0, amp: 0.5 });
    // two walls of a room cut open: the kitchen wall on the left, the back wall on the right
    h += k.box(-0.3, -0.3, 0, 0.3, FY + 0.3, WH, PAL.wall);
    h += k.box(0, -0.3, 0, FX, 0.3, WH, PAL.wall, { side: k.darker(PAL.wall, 0.09) });
    // the hatch the line comes through, with its sill and jamb
    const hy0 = BY - 0.72, hy1 = BY + 0.72, hz0 = 0.5, hz1 = 1.95;
    h += k.wash([wallP(hy0, hz0), wallP(hy1, hz0), wallP(hy1, hz1), wallP(hy0, hz1)], PAL.dark);
    h += k.wash([P(0, hy0, hz0), P(0, hy1, hz0), P(-0.3, hy1, hz0), P(-0.3, hy0, hz0)], k.darker(PAL.wall, 0.3));
    h += k.wash([P(0, hy0, hz0), P(0, hy0, hz1), P(-0.3, hy0, hz1), P(-0.3, hy0, hz0)], k.darker(PAL.wall, 0.45));
    h += k.loop([wallP(hy0, hz0), wallP(hy1, hz0), wallP(hy1, hz1), wallP(hy0, hz1)], { w: 1.4 });
    h += k.shape("M" + [wallP(BY + 1.2, 2.2), wallP(BY - 1.2, 2.2), wallP(BY - 1.2, 2.8), wallP(BY + 1.2, 2.8)].map((p) => k.f(p[0]) + " " + k.f(p[1])).join("L") + "Z", PAL.white, 1.2);
    const s0 = wallP(BY + 1.03, 2.34);
    h += `<text class="sign" transform="matrix(${k.CS} ${-k.SN} 0 1 ${k.f(s0[0])} ${k.f(s0[1])})">KITCHEN</text>`;
    // on the back wall: a window, the clock face, a shelf of jars, a door
    h += k.wash([backP(1.2, 1.6), backP(3.3, 1.6), backP(3.3, 3.0), backP(1.2, 3.0)], PAL.glass);
    h += k.loop([backP(1.2, 1.6), backP(3.3, 1.6), backP(3.3, 3.0), backP(1.2, 3.0)], { w: 1.5 });
    h += k.edges([[backP(2.25, 1.6), backP(2.25, 3.0)], [backP(1.2, 2.4), backP(3.3, 2.4)]], { w: 1.1 });
    h += k.edges([[backP(1.5, 1.85), backP(1.9, 2.2)], [backP(1.55, 2.05), backP(1.75, 2.22)], [backP(2.6, 2.6), backP(3.0, 2.85)]], { w: 0.8, op: 0.5, over: 0 });
    const c0 = P(CLOCK[0], 0, CLOCK[1]), m = `matrix(${k.f(k.CS * U)} ${k.f(k.SN * U)} 0 ${-U} ${k.f(c0[0])} ${k.f(c0[1])})`;
    let ticks = "";
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r0 = CLOCK[2] * (i % 3 ? 0.84 : 0.74), r1 = CLOCK[2] * 0.92; ticks += `M${(Math.sin(a) * r0).toFixed(3)} ${(Math.cos(a) * r0).toFixed(3)}L${(Math.sin(a) * r1).toFixed(3)} ${(Math.cos(a) * r1).toFixed(3)}`; }
    h += `<g transform="${m}"><circle r="${CLOCK[2] + 0.07}" fill="${PAL.dark}"/><circle r="${CLOCK[2]}" fill="${PAL.white}"/><path class="ink thin" d="${ticks}"/></g>`;
    h += k.box(3.62, 0, 1.95, 1.56, 0.42, 0.08, PAL.wood);
    FLAVORS.forEach((fl, i) => { h += k.cyl(3.92 + i * 0.48, 0.21, 2.03, 0.15, 0.36, PAL[fl]) + k.cyl(3.92 + i * 0.48, 0.21, 2.39, 0.16, 0.06, PAL.white); });
    h += k.wash([backP(11.2, 0), backP(12.4, 0), backP(12.4, 2.5), backP(11.2, 2.5)], PAL.blue);
    h += k.loop([backP(11.2, 0), backP(12.4, 0), backP(12.4, 2.5), backP(11.2, 2.5)], { w: 1.4 });
    h += k.loop([backP(11.4, 1.4), backP(12.2, 1.4), backP(12.2, 2.3), backP(11.4, 2.3)], { w: 0.9, op: 0.7, over: 0.5 });
    h += k.dot(...backP(12.2, 1.15), 2.6, PAL.yellow, 1.1);
    // spare boxes against the back wall
    h += k.shadow([P(8.6, 1.5), P(10.85, 1.5), P(10.85, 1.85), P(8.6, 1.85)]);
    h += k.box(8.6, 0.5, 0, 1.1, 1.0, 0.8, PAL.wood) + k.box(8.75, 0.6, 0.8, 0.8, 0.8, 0.6, PAL.woodDark) + k.box(9.95, 0.45, 0, 0.9, 0.9, 0.7, PAL.wood);
    // what the belt and the boxes throw on the floor
    h += k.shadow([P(0, BY + 0.5), P(X1, BY + 0.5), P(X1, BY + 0.95), P(0, BY + 0.95)], 0.12);
    k.still(h);
  }

  function beltParts() {
    const y0 = BY - BW / 2, y1 = BY + BW / 2, top = [P(0, y0 + 0.08, TOP), P(X1, y0 + 0.08, TOP), P(X1, y1 - 0.08, TOP), P(0, y1 - 0.08, TOP)];
    const legX = [1.2, 3.6, 6.0, 8.4, 10.3];
    let h = legX.map((x) => k.box(x, y0 + 0.06, 0, 0.12, 0.12, 0.62, PAL.steel)).join("");
    h += k.box(0, y0, 0.62, X1, BW, TOP - 0.62, PAL.steel);
    h += k.wash(top, PAL.belt) + k.loop(top, { w: 1 });
    h += legX.map((x) => k.box(x, y1 - 0.18, 0, 0.12, 0.12, 0.62, PAL.steel)).join("");
    const d = "M" + top.map((p) => k.f(p[0]) + " " + k.f(p[1])).join("L") + "Z";
    let lines = "";
    for (let i = -1; i * SLAT < X1; i++) { const a = P(i * SLAT, y0 + 0.12, TOP), b = P(i * SLAT, y1 - 0.12, TOP); lines += `M${k.f(a[0])} ${k.f(a[1])}L${k.f(b[0])} ${k.f(b[1])}`; }
    h += `<defs><clipPath id="belt-top"><path d="${d}"/></clipPath></defs><g clip-path="url(#belt-top)"><g id="slats"><path d="${lines}" stroke="#c9c2b8" stroke-width="1.3" opacity=".75" fill="none"/></g></g>`;
    return h;
  }

  function station(def, i) {
    const look = { watch: 0, filter: 1, wrap: 2 }[def.kind], coat = { watch: PAL.green, filter: PAL.blue, wrap: PAL.red }[def.kind];
    const foot = P(def.x, WY, 0), st = { ...def, foot, act: -9, phase: i * 1.7 };
    if (def.kind === "wrap") {              // a side table with a roll of wrapping paper
      k.node(L.dolls, k.box(def.x + 0.75, WY - 0.75, 0, 0.9, 0.7, 0.8, PAL.wood) + k.cyl(def.x + 1.2, WY - 0.4, 0.8, 0.2, 0.45, PAL.white));
    }
    st.body = k.node(L.dolls, `<g transform="scale(${MAN})">${k.doll({ look, coat })}</g>`);
    st.arms = k.SHOULDER.map((s, a) => k.node(L.arms, `<g transform="scale(${MAN})">${k.arm({ look, coat, tool: def.kind === "filter" && a === 0 ? "paddle" : null })}</g>`));
    if (def.kind === "filter") {
      st.bin = [def.x + 0.15, BY + 1.3, 1.2, 1.0, 0.7];
      const c = k.crate(st.bin[0], st.bin[1], 0, st.bin[2], st.bin[3], st.bin[4], PAL.red);
      k.node(L.under, k.shadow([P(st.bin[0], st.bin[1] + st.bin[3]), P(st.bin[0] + st.bin[2], st.bin[1] + st.bin[3]), P(st.bin[0] + st.bin[2], st.bin[1] + st.bin[3] + 0.35), P(st.bin[0], st.bin[1] + st.bin[3] + 0.35)]) + c.under);
      k.node(L.over, c.over);
    }
    return st;
  }

  /* ----- candies ----- */
  function candyArt(it) {
    const r = it.r * U, col = PAL[it.flavor], pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, q = r * (1 + 0.035 * Math.sin(i * 2.4 + it.id)); pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
    const ball = k.curve(pts, true);
    let h = `<ellipse class="cs" cx="${k.f(r * 0.25)}" cy="${k.f(r * 1.02)}" rx="${k.f(r * 1.05)}" ry="${k.f(r * 0.42)}" fill="#3d3631" opacity=".28"/>`;
    if (it.wrapped) {
      const tw = (s) => k.shape(`M${k.f(s * r * 0.8)} 0L${k.f(s * r * 1.85)} ${k.f(-r * 0.68)}L${k.f(s * r * 1.6)} 0L${k.f(s * r * 1.85)} ${k.f(r * 0.68)}Z`, k.lighter(col, 0.3), 1.2);
      h += `<g transform="rotate(30)">${tw(-1)}${tw(1)}${k.shape(ball, col, 1.4)}`;
      h += `<path d="M${k.f(-r * 0.34)} ${k.f(-r * 0.93)}Q${k.f(-r * 0.05)} 0 ${k.f(-r * 0.34)} ${k.f(r * 0.93)}L${k.f(r * 0.34)} ${k.f(r * 0.93)}Q${k.f(r * 0.63)} 0 ${k.f(r * 0.34)} ${k.f(-r * 0.93)}Z" fill="${PAL.white}" opacity=".9"/>`;
      h += `<path class="ink" d="M${k.f(-r * 0.34)} ${k.f(-r * 0.93)}Q${k.f(-r * 0.05)} 0 ${k.f(-r * 0.34)} ${k.f(r * 0.93)}M${k.f(r * 0.34)} ${k.f(-r * 0.93)}Q${k.f(r * 0.63)} 0 ${k.f(r * 0.34)} ${k.f(r * 0.93)}" stroke-width="1"/></g>`;
    } else {
      h += k.shape(ball, col, 1.4);
      h += `<path d="M${k.f(-r * 0.55)} ${k.f(-r * 0.25)}Q${k.f(-r * 0.5)} ${k.f(-r * 0.62)} ${k.f(-r * 0.12)} ${k.f(-r * 0.66)}" stroke="#fffaf0" stroke-width="${k.f(r * 0.2)}" stroke-linecap="round" fill="none" opacity=".75"/>`;
    }
    return `<g transform="translate(0 ${k.f(-r)})">${h}</g>`;
  }
  function wrap(it) { it.wrapped = true; it.el.innerHTML = candyArt(it); }
  function newCandy(born) {
    let small = rnd() < 0.34;
    if (small && smallRun >= 2) small = false;
    smallRun = small ? smallRun + 1 : 0;
    let fl = FLAVORS[Math.floor(rnd() * 3)];
    if (fl === lastFlavor && rnd() < 0.6) fl = FLAVORS[(FLAVORS.indexOf(fl) + 1) % 3];
    lastFlavor = fl;
    const it = { id: serial++, flavor: fl, small, r: small ? R_SMALL : R, state: "belt", done: 0, wrapped: false, pop: -9, born };
    it.el = k.node(L.candy, ""); it.el.innerHTML = candyArt(it);
    items.push(it);
    return it;
  }
  const gap = () => (rnd() < 0.22 ? 0.8 + rnd() * 0.25 : 1.3 + rnd() * 2.1);    // candies come unevenly, sometimes two close together

  /* A candy meets every worker it has reached. quiet = before the story starts, so nothing is counted or animated. */
  function meet(it, x, now, quiet) {
    while (it.state === "belt" && it.done < stations.length && x >= stations[it.done].x) {
      const st = stations[it.done++];
      if (st.kind === "watch") { if (!quiet) counts.seen++; }
      else if (st.kind === "filter") {
        if (it.small) {
          if (quiet) it.state = "gone";
          else { it.state = "push"; it.t0 = now; it.from = x; it.bin = st.bin; st.act = now; counts.small++; }
        } else if (!quiet) counts.passed++;
      } else if (st.kind === "wrap") {
        wrap(it);
        if (!quiet) { it.pop = now; st.act = now; counts.wrapped++; }
      }
    }
  }

  function place(it, now) {
    const x = V * (now - it.born);
    let p, s = 1, air = false;
    if (it.state === "belt") {
      meet(it, x, now, false);
      if (it.state === "belt" && x >= X1) { it.state = "fall"; it.t0 = now; }
    }
    if (it.state === "belt") {
      p = P(x, BY, TOP);
      const u = (now - it.pop) / POP;
      if (u >= 0 && u < 1) s = 1 + 0.4 * Math.sin(Math.PI * u);
      it.el.style.opacity = Math.max(0, Math.min(1, (x - 0.05) / 0.3));
    } else if (it.state === "push") {         // off the line, over the edge and into the bin
      const u = (now - it.t0) / PUSH, e = Math.min(1, u), b = it.bin, sink = Math.max(0, u - 1) / 0.35;
      if (sink >= 1) { it.state = "gone"; return; }
      p = P(it.from + (b[0] + b[2] / 2 - it.from) * e, BY + (b[1] + b[3] / 2 - BY) * e, TOP + (b[4] - 0.05 - TOP) * e + 0.75 * Math.sin(Math.PI * e) - sink * 0.55);
      air = true;
    } else if (it.state === "fall") {         // off the end of the line, into the shipping box
      const u = (now - it.t0) / FALL, e = Math.min(1, u), sink = Math.max(0, u - 1) / 0.35;
      if (sink >= 1) { it.state = "gone"; return; }
      p = P(X1 + 1.15 * e, BY, TOP + 0.25 * Math.sin(Math.PI * e) - 0.2 * e - sink * 0.5);
      air = true;
    } else return;
    it.el.setAttribute("transform", `translate(${k.f(p[0])} ${k.f(p[1])})${s !== 1 ? ` scale(${s.toFixed(3)})` : ""}`);
    if (air !== it.air) { it.air = air; it.el.classList.toggle("air", air); }
  }

  function workers(now) {
    stations.forEach((st) => {
      // the candy this worker is dealing with: the nearest one that has not gone past yet
      let near = 9;
      items.forEach((it) => { if (it.state !== "belt") return; const d = st.x - V * (now - it.born); if (d > -0.5 && Math.abs(d) < Math.abs(near)) near = d; });
      const busy = Math.max(0, 1 - (now - st.act) / 0.5);
      const ready = st.kind === "watch" ? 0 : Math.max(0, 1 - Math.abs(near) / 0.9) * 0.6;
      const reach = Math.max(busy, ready);
      const lean = -5 * reach + Math.sin(now * 1.7 + st.phase) * 0.8, bob = Math.sin(now * 2.2 + st.phase) * 0.6;
      const [fx, fy] = st.foot, a = (lean * Math.PI) / 180;
      st.body.setAttribute("transform", `translate(${k.f(fx)} ${k.f(fy + bob)}) rotate(${lean.toFixed(2)})`);
      const turn = [
        8 + 62 * reach + (st.kind === "filter" ? 12 * busy : 0),
        -8 + (st.kind === "wrap" ? 72 : st.kind === "filter" ? 30 : 0) * reach,
      ];
      k.SHOULDER.forEach(([sx, sy], i) => {
        const x = fx + MAN * (sx * Math.cos(a) - sy * Math.sin(a)), y = fy + bob + MAN * (sx * Math.sin(a) + sy * Math.cos(a));
        st.arms[i].setAttribute("transform", `translate(${k.f(x)} ${k.f(y)}) rotate(${turn[i].toFixed(1)})`);
      });
    });
  }

  /* ----- labels: each scene names only what it is about ----- */
  function labels() {
    const first = stations[0], last = stations[stations.length - 1], head = (st) => [st.foot[0] + 15 * MAN, st.foot[1] - 60 * MAN];
    const list = [
      { title: "KITCHEN", note: "candies come out one by one", x: 56, y: 150, side: "start", to: P(0, BY + 0.3, 1.7) },
      { title: "THE LINE", note: "never stops, never ends", x: 56, y: 486, side: "start", to: P(1.9, BY + 0.5, TOP) },
      { title: "CLOCK", note: "every candy has its moment", x: 1344, y: 130, side: "end", to: P(CLOCK[0] + 0.45, 0, CLOCK[1] + 0.2) },
      { title: "SHIPPING", note: "out as soon as it is ready", x: 1344, y: 650, side: "end", to: P(X1 + 1.9, BY + 0.2, 0.55) },
    ];
    const who = (st, title, note, y) => list.push({ title, note, x: 1344, y, side: "end", to: head(st) });
    if (sc.id === "line") who(first, "WORKER", "sees each candy as it passes", 300);
    if (sc.id === "inspector") who(first, "INSPECTOR", "one look, one decision", 300);
    if (sc.id === "wrapper") who(first, "WRAPPER", "one in, one out, changed", 300);
    if (sc.id === "both") { who(first, "INSPECTOR", "first job: pick", 250); who(last, "WRAPPER", "second job: wrap", 380); }
    const f = stations.find((s) => s.kind === "filter");
    if (f) list.push({ title: "TOO SMALL", note: "off the line, for good", x: 56, y: 660, side: "start", to: P(f.bin[0] + 0.15, f.bin[1] + f.bin[3], 0.45) });
    k.setLabels(list);
  }

  function init(kit, scene) {
    k = kit; PAL = kit.PAL; P = kit.P; U = kit.U; sc = scene; rnd = kit.rng(7);
    items = []; smallRun = 0; lastFlavor = null; serial = 0; counts = { seen: 0, passed: 0, small: 0, wrapped: 0 };
    room();
    // the moving part of the sheet, back to front
    L = { clock: k.layer(), dolls: k.layer(), belt: k.layer(), under: k.layer(), candy: k.layer(), arms: k.layer(), over: k.layer() };
    const c0 = P(CLOCK[0], 0, CLOCK[1]);
    hands = k.node(L.clock, `<line class="ink thin" x1="0" y1="0" stroke-width="2.2"/><line class="ink thin" x1="0" y1="0" stroke-width="1.4" style="stroke:#c4604f"/><circle r=".05" fill="${k.INK}"/>`, `transform="matrix(${k.f(k.CS * U)} ${k.f(k.SN * U)} 0 ${-U} ${k.f(c0[0])} ${k.f(c0[1])})"`).querySelectorAll("line");
    k.node(L.belt, beltParts()); slats = document.querySelector("#slats");
    stations = scene.stations.map(station);
    const ship = k.crate(X1 + 0.4, BY - 0.7, 0, 1.5, 1.4, 0.75, PAL.wood);
    k.node(L.under, k.shadow([P(X1 + 0.4, BY + 0.7), P(X1 + 1.9, BY + 0.7), P(X1 + 1.9, BY + 1.05), P(X1 + 0.4, BY + 1.05)]) + ship.under);
    k.node(L.over, ship.over);
    k.labelLayer(); labels();
    k.focus([246, 24, 908, 760]);
    // the line is already running when the story opens: candies made in the last seconds are on their way
    nextBorn = -X1 / V + 0.4;
    while (nextBorn <= 0) { const it = newCandy(nextBorn); meet(it, V * (0 - it.born), 0, true); nextBorn += gap(); }
    tick(0, 0);
  }

  function tick(dt, now) {
    while (nextBorn <= now) { newCandy(nextBorn); nextBorn += gap(); }
    items.forEach((it) => place(it, now));
    items = items.filter((it) => { if (it.state === "gone") it.el.remove(); return it.state !== "gone"; });
    workers(now);
    const ph = (V * now) % SLAT;
    slats.setAttribute("transform", `translate(${k.f(ph * k.CS * U)} ${k.f(ph * k.SN * U)})`);
    const hand = (el, turn, len) => { const a = turn * Math.PI * 2; el.setAttribute("x2", (Math.sin(a) * len).toFixed(3)); el.setAttribute("y2", (Math.cos(a) * len).toFixed(3)); };
    hand(hands[0], now / 3600, CLOCK[2] * 0.5); hand(hands[1], now / 60, CLOCK[2] * 0.8);
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
