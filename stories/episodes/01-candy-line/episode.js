/* Story 01, The candy line.
   A stream is a line that never ends, an event is one candy, an operator is a worker on the line.
   The same candies come out of the kitchen in every scene; only the workers change. */
(() => {
  const V = 1.3;                         // belt speed, floor units per second
  const X0 = -7, X1 = 4.9, BZ = 0.8, TOP = 0.9, BW = 0.95;   // the belt: from the hatch to the shipping box
  const R = 0.3, R_SMALL = 0.17, MAN = 1.75, BACK = 1.12;   // candy sizes, worker size, how far behind the line a worker stands
  const FLAVORS = ["a", "b", "c"];
  const PUSH = 0.55, FALL = 0.42, POP = 0.4;
  const CLOCK = [0.4, 3.25];              // where the clock hangs on the back wall

  const SCENES = [
    { id: "line", label: "The line", stations: [{ kind: "watch", x: -1.4 }],
      story: "A stream is like this candy line. It has no last candy. Each one rolls out of the kitchen at its own moment, and the clock on the wall keeps the time. Nobody waits for the batch to be finished, because it never is." },
    { id: "inspector", label: "The inspector", stations: [{ kind: "filter", x: -1.4 }],
      story: "A worker on the line looks at one candy at a time and decides on the spot. Big enough stays on the line. Too small goes in the bin. The worker needs no memory of the candies before. Engineers call this a filter." },
    { id: "wrapper", label: "The wrapper", stations: [{ kind: "wrap", x: -1.4 }],
      story: "This worker changes every candy. One raw candy comes in, one wrapped candy goes out, and the line never stops for it. Engineers call this a transform." },
    { id: "both", label: "The whole line", stations: [{ kind: "filter", x: -3.4 }, { kind: "wrap", x: 1.0 }],
      story: "Workers stand in a row and each one does a small job. Raw candy goes in on the left and finished candy comes out on the right, a moment after it arrived. That is stream processing: the work happens while things move." },
  ];

  let k, C, rnd, sc, belt, wallClock, items, stations, nextBorn, smallRun, lastFlavor, counts;

  /* ----- the room ----- */
  function room() {
    const w = k.world;
    w.add(k.slab(14, 7));
    w.add(k.walls(14, 7, 4.2, { z: BZ, w: 1.7, y0: 0.55, y1: 2.0 }));
    belt = k.belt(X0 - 0.3, X1, BZ, V, { top: TOP, w: BW }); w.add(belt.group);
    wallClock = k.clock(0.66); k.at(wallClock.group, CLOCK[0], CLOCK[1], -3.49); w.add(wallClock.group);
    // on the back wall: a window, a shelf of jars and a door
    w.add(k.at(k.box(2.5, 1.4, 0.05, C.glass), -4.6, 2.1, -3.48));
    w.add(k.at(k.box(0.07, 1.4, 0.07, C.white), -4.6, 2.1, -3.47));
    w.add(k.at(k.box(2.5, 0.07, 0.07, C.white), -4.6, 2.77, -3.47));
    w.add(k.at(k.box(2.3, 0.08, 0.5, C.wood), -1.75, 2.75, -3.24));
    FLAVORS.forEach((f, i) => {
      w.add(k.at(k.cyl(0.2, 0.2, 0.46, C[f]), -2.5 + i * 0.75, 2.83, -3.24));
      w.add(k.at(k.cyl(0.21, 0.21, 0.08, C.white), -2.5 + i * 0.75, 3.29, -3.24));
    });
    w.add(k.at(k.box(1.25, 2.5, 0.06, C.blue), 5.6, 0, -3.47));
    w.add(k.at(k.ball(0.07, C.yellow), 5.15, 1.2, -3.4));
    // spare boxes against the back wall
    w.add(k.at(k.box(1.1, 0.8, 1.0, C.wood), 3.6, 0, -2.85));
    w.add(k.at(k.box(0.85, 0.65, 0.85, C.woodDark), 3.55, 0.8, -2.9).rotateY(0.3));
    // the shipping box at the end of the line
    w.add(holeBox(1.5, 0.62, 1.35, C.wood, X1 + 1.05, BZ));
  }
  /* A box you can drop things into: the dark top reads as an opening. */
  function holeBox(bw, h, d, color, x, z) {
    return k.at(k.group(k.box(bw, h, d, color), k.at(k.box(bw - 0.2, 0.012, d - 0.2, C.dark, { ink: false, cast: false }), 0, h, 0)), x, 0, z);
  }

  function station(def, i) {
    const coat = { watch: C.green, filter: C.blue, wrap: C.red }[def.kind];
    const p = k.person({ look: def.kind === "wrap" ? 2 : def.kind === "filter" ? 1 : 0, coat });
    p.group.scale.setScalar(MAN);
    k.at(p.group, def.x, 0.04, BZ - BACK);
    k.world.add(p.group);
    k.world.add(k.at(k.box(1.5, 0.04, 1.05, C.yellow, { cast: false }), def.x, 0, BZ - BACK));    // the worker's mat
    if (def.kind === "filter") {
      const paddle = k.group(k.at(k.box(0.05, 0.24, 0.05, C.woodDark), 0, -0.62, 0), k.at(k.box(0.2, 0.1, 0.05, C.wood), 0, -0.7, 0));
      p.arms[1].add(paddle);
      k.world.add(holeBox(1.05, 0.6, 1.05, C.red, def.x + 0.6, BZ + 1.75));
    }
    if (def.kind === "wrap") {      // a side table with a roll of wrapping paper
      k.world.add(k.at(k.box(0.9, 0.75, 0.7, C.wood), def.x + 1.45, 0, BZ - BACK - 0.1));
      k.world.add(k.at(k.cyl(0.2, 0.2, 0.6, C.white, { seg: 16 }), def.x + 1.15, 0.97, BZ - BACK - 0.1).rotateZ(-Math.PI / 2));
    }
    return { ...def, p, act: -9, phase: i * 1.7 };
  }

  /* ----- candies ----- */
  function candy(flavor, small) {
    const r = small ? R_SMALL : R;
    return { flavor, small, r, obj: k.group(k.ball(r, C[flavor])), state: "belt", done: 0, wrapped: false, pop: -9 };
  }
  function wrap(it) {
    const r = it.r, col = C[it.flavor];
    [-1, 1].forEach((s) => it.obj.add(k.at(k.cyl(r * 0.62, 0.02, r * 0.75, col, { seg: 10 }), s * r * 0.82, 0, 0).rotateZ(-s * Math.PI / 2)));
    it.obj.add(k.at(k.cyl(r * 1.04, r * 1.04, r * 0.5, C.white, { ink: false, seg: 18 }), -r * 0.25, 0, 0).rotateZ(-Math.PI / 2));
    it.wrapped = true;
  }
  function newCandy(born) {
    let small = rnd() < 0.34;
    if (small && smallRun >= 2) small = false;
    smallRun = small ? smallRun + 1 : 0;
    let f = FLAVORS[Math.floor(rnd() * 3)];
    if (f === lastFlavor && rnd() < 0.6) f = FLAVORS[(FLAVORS.indexOf(f) + 1) % 3];
    lastFlavor = f;
    const it = candy(f, small); it.born = born;
    k.world.add(it.obj); items.push(it);
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
          if (quiet) { it.state = "gone"; } else { it.state = "push"; it.t0 = now; it.from = x; it.to = st.x + 0.6; st.act = now; counts.small++; }
        } else if (!quiet) counts.passed++;
      } else if (st.kind === "wrap") {
        wrap(it);
        if (!quiet) { it.pop = now; st.act = now; counts.wrapped++; }
      }
    }
  }

  function place(it, now) {
    const o = it.obj, x = X0 + V * (now - it.born), y = TOP + it.r;
    if (it.state === "belt") {
      meet(it, x, now, false);
      if (it.state === "belt") {
        if (x >= X1) { it.state = "fall"; it.t0 = now; }
        o.position.set(x, y, BZ);
        const u = (now - it.pop) / POP;
        o.scale.setScalar(u >= 0 && u < 1 ? 1 + 0.4 * Math.sin(Math.PI * u) : 1);
        o.visible = x > X0 - 0.2;
        return;
      }
    }
    if (it.state === "push") {              // off the line, over the edge and into the bin
      const u = (now - it.t0) / PUSH;
      if (u >= 1.3) { it.state = "gone"; return; }
      const e = Math.min(1, u), drop = Math.max(0, u - 1) / 0.3;
      o.position.set(it.from + (it.to - it.from) * e, y + (0.6 + it.r - y) * e * e + 0.5 * Math.sin(Math.PI * e) - drop * 0.5, BZ + 1.75 * e);
      return;
    }
    if (it.state === "fall") {              // off the end of the line, into the shipping box
      const u = (now - it.t0) / FALL;
      if (u >= 1.35) { it.state = "gone"; return; }
      o.position.set(X1 + 1.0 * Math.min(1, u), y - (y - 0.4) * u * u, BZ);
    }
  }

  function workers(now) {
    stations.forEach((st) => {
      // the candy this worker is dealing with: the nearest one that has not gone past yet
      let near = 9;
      items.forEach((it) => { if (it.state !== "belt") return; const d = st.x - (X0 + V * (now - it.born)); if (d > -0.5 && Math.abs(d) < Math.abs(near)) near = d; });
      const busy = Math.max(0, 1 - (now - st.act) / 0.5);
      const ready = st.kind === "watch" ? 0 : Math.max(0, 1 - Math.abs(near) / 0.9) * 0.55;
      const reach = Math.max(busy, ready);
      const b = st.p.body;
      b.position.y = Math.sin(now * 2.2 + st.phase) * 0.012;
      b.rotation.y = Math.max(-0.6, Math.min(0.6, -near * 0.3));
      b.rotation.x = 0.06 + 0.2 * reach;
      st.p.arms[0].rotation.x = -0.3 - (st.kind === "wrap" ? 1.0 : 0.25) * reach;
      st.p.arms[1].rotation.x = -0.3 - 1.0 * reach - (st.kind === "filter" ? 0.5 * busy : 0);
    });
  }

  /* ----- labels: each scene names only what it is about ----- */
  function tags() {
    const first = stations[0], last = stations[stations.length - 1];
    const list = [
      { title: "Kitchen", sub: "candies come out one by one", at: [X0, 1.5, BZ], side: "left", y: 0.2 },
      { title: "The line", sub: "never stops, never ends", at: [X0 + 2.2, TOP, BZ + 0.3], side: "left", y: 0.5 },
      { title: "Clock", sub: "every candy has its moment", at: [CLOCK[0], CLOCK[1], -3.4], side: "right", y: 0.12 },
      { title: "Shipping", sub: "out as soon as it is ready", at: [X1 + 1.5, 0.62, BZ + 0.3], side: "right", y: 0.8 },
    ];
    const who = (st, title, sub, y) => list.push({ title, sub, at: [st.x + 0.25, 1.75, BZ - BACK], side: "right", y });
    if (sc.id === "line") who(first, "Worker", "sees each candy as it passes", 0.4);
    if (sc.id === "inspector") who(first, "Inspector", "one look, one decision", 0.4);
    if (sc.id === "wrapper") who(first, "Wrapper", "one in, one out, changed", 0.4);
    if (sc.id === "both") { who(first, "Inspector", "first job: pick", 0.33); who(last, "Wrapper", "second job: wrap", 0.55); }
    const bin = stations.find((s) => s.kind === "filter");
    if (bin) list.push({ title: "Too small", sub: "off the line, for good", at: [bin.x + 0.3, 0.62, BZ + 2.2], side: "left", y: 0.8 });
    k.setTags(list);
  }

  function init(kit, scene) {
    k = kit; C = kit.C; sc = scene; rnd = kit.rng(7);
    items = []; smallRun = 0; lastFlavor = null; counts = { seen: 0, passed: 0, small: 0, wrapped: 0 };
    room();
    stations = scene.stations.map(station);
    // the line is already running when the story opens: candies made in the last seconds are on their way
    nextBorn = -(X1 - X0) / V + 0.4;
    while (nextBorn <= 0) { const it = newCandy(nextBorn); meet(it, X0 + V * (0 - it.born), 0, true); nextBorn += gap(); }
    k.frame([-7.3, 7, -0.85, 4.2, -3.8, 3.5], 0.3, 0.04);
    tags();
    tick(0, 0);
  }

  function tick(dt, now) {
    while (nextBorn <= now) { newCandy(nextBorn); nextBorn += gap(); }
    items.forEach((it) => place(it, now));
    items = items.filter((it) => { if (it.state === "gone") k.drop(it.obj); return it.state !== "gone"; });
    workers(now);
    belt.update(now); wallClock.update(now);
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
