/* Stream Stories: the candy factory that every story is set in.
   Factory(kit) gives an episode the room, the lines, the workers and the things that travel: candies, cups and report cards.
   Places are in room units: x runs along the lines (down and right on the sheet), y across the room, z up. */
const Factory = (k) => {
  const { PAL, P, U, f, CS, SN } = k;
  const FX = 13, FY = 6.4, WH = 3.7;               // floor size and wall height
  const TOP = 0.72, BW = 1.0, V = 1.3, SLAT = 0.6, LEG = TOP - 0.28;  // a line: height of its top (a worker's hip), its width, its speed
  const MAN = 1.15, R = 0.3, R_SMALL = 0.18;       // size of a worker, of a candy, of a small candy
  const FLAVORS = ["a", "b", "c"];
  const NAMES = { a: "ORANGE", b: "MINT", c: "GRAPE" };
  const path = (pts) => "M" + pts.map((p) => f(p[0]) + " " + f(p[1])).join("L") + "Z";
  let uid = 0, tweens = [], jobs = [];

  /* text that lies on a wall: the left wall is the one the lines come through, the back wall is the long one behind */
  const onLeft = (y, z) => { const p = P(0, y, z); return `matrix(${CS} ${-SN} 0 1 ${f(p[0])} ${f(p[1])})`; };
  const onBack = (x, z) => { const p = P(x, 0, z); return `matrix(${CS} ${SN} 0 1 ${f(p[0])} ${f(p[1])})`; };
  /* a flat panel on the back wall, from x0 to x1 and z0 to z1 */
  const panel = (x0, x1, z0, z1, col, w = 1.4) => { const q = [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)]; return k.wash(q, col) + k.loop(q, { w }); };

  /* ----- the room, drawn once into the still part of the sheet -----
     o.hatches: [{ y, sign }] openings in the left wall; o.window: [x0, x1]; o.clock: [x, z, r]; o.door: x of its left edge */
  function room(o = {}) {
    const hatches = o.hatches ?? [{ y: 3.9, sign: "KITCHEN" }], L = (y, z) => P(0, y, z), B = (x, z) => P(x, 0, z);
    let h = k.box(-0.3, -0.3, -0.55, FX + 0.3, FY + 0.3, 0.37, PAL.base)
      + k.box(-0.3, -0.3, -0.18, FX + 0.3, FY + 0.3, 0.18, k.darker(PAL.floor, 0.12), { top: PAL.floor });
    const joints = [];
    for (let x = 1; x < FX; x++) joints.push([P(x, 0), P(x, FY)]);
    for (let y = 1; y < FY; y++) joints.push([P(0, y), P(FX, y)]);
    h += k.edges(joints, { w: 0.7, op: 0.2, over: 0, amp: 0.5 });
    h += k.box(-0.3, -0.3, 0, 0.3, FY + 0.3, WH, PAL.wall) + k.box(0, -0.3, 0, FX, 0.3, WH, PAL.wall, { side: k.darker(PAL.wall, 0.09) });
    hatches.forEach(({ y, sign }) => {
      const y0 = y - 0.72, y1 = y + 0.72, z0 = TOP - 0.4, z1 = TOP + 1.05, q = [L(y0, z0), L(y1, z0), L(y1, z1), L(y0, z1)];
      h += k.wash(q, PAL.dark);
      h += k.wash([P(0, y0, z0), P(0, y1, z0), P(-0.3, y1, z0), P(-0.3, y0, z0)], k.darker(PAL.wall, 0.3));     // the sill
      h += k.wash([P(0, y0, z0), P(0, y0, z1), P(-0.3, y0, z1), P(-0.3, y0, z0)], k.darker(PAL.wall, 0.45));    // the far jamb
      h += k.loop(q, { w: 1.4 });
      if (sign) {
        const w = (sign.length * 17 + 26) / U;
        h += k.shape(path([L(y + w / 2, 2.2), L(y - w / 2, 2.2), L(y - w / 2, 2.8), L(y + w / 2, 2.8)]), PAL.white, 1.2);
        h += `<text class="sign" transform="${onLeft(y + w / 2 - 14 / U, 2.34)}">${sign}</text>`;
      }
    });
    if (o.window) {
      const [x0, x1] = o.window, xm = (x0 + x1) / 2;
      h += panel(x0, x1, 1.6, 3.0, PAL.glass, 1.5) + k.edges([[B(xm, 1.6), B(xm, 3.0)], [B(x0, 2.4), B(x1, 2.4)]], { w: 1.1 });
      h += k.edges([[B(x0 + 0.3, 1.85), B(x0 + 0.7, 2.2)], [B(xm + 0.35, 2.6), B(xm + 0.75, 2.85)]], { w: 0.8, op: 0.5, over: 0 });
    }
    if (o.clock) {
      const [cx, cz, r] = o.clock, c0 = P(cx, 0, cz); let ticks = "";
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r0 = r * (i % 3 ? 0.84 : 0.74), r1 = r * 0.92; ticks += `M${(Math.sin(a) * r0).toFixed(3)} ${(Math.cos(a) * r0).toFixed(3)}L${(Math.sin(a) * r1).toFixed(3)} ${(Math.cos(a) * r1).toFixed(3)}`; }
      h += `<g transform="matrix(${f(CS * U)} ${f(SN * U)} 0 ${-U} ${f(c0[0])} ${f(c0[1])})"><circle r="${r + 0.07}" fill="${PAL.dark}"/><circle r="${r}" fill="${PAL.white}"/><path class="ink thin" d="${ticks}"/></g>`;
    }
    if (o.door != null) {
      const x = o.door;
      h += panel(x, x + 1.2, 0, 2.5, PAL.blue) + k.loop([B(x + 0.2, 1.4), B(x + 1.0, 1.4), B(x + 1.0, 2.3), B(x + 0.2, 2.3)], { w: 0.9, op: 0.7, over: 0.5 }) + k.dot(...B(x + 1.0, 1.15), 2.6, PAL.yellow, 1.1);
    }
    k.still(h);
  }
  /* the hands of the wall clock; returns a function to call every frame */
  function clockHands(layer, [cx, cz, r]) {
    const c0 = P(cx, 0, cz);
    const hands = k.node(layer, `<line class="ink thin" x1="0" y1="0" stroke-width="2.2"/><line class="ink thin" x1="0" y1="0" stroke-width="1.4" style="stroke:#c4604f"/><circle r=".05" fill="${k.INK}"/>`, `transform="matrix(${f(CS * U)} ${f(SN * U)} 0 ${-U} ${f(c0[0])} ${f(c0[1])})"`).querySelectorAll("line");
    const set = (el, turn, len) => { const a = turn * Math.PI * 2; el.setAttribute("x2", (Math.sin(a) * len).toFixed(3)); el.setAttribute("y2", (Math.cos(a) * len).toFixed(3)); };
    return (now) => { set(hands[0], now / 3600, r * 0.5); set(hands[1], now / 60, r * 0.8); };
  }

  /* ----- a line (conveyor) from x0 to x1, centred on y. Its slats move, so the line visibly runs. ----- */
  function belt(layer, x0, x1, y) {
    const y0 = y - BW / 2, y1 = y + BW / 2, id = "belt" + ++uid;
    const top = [P(x0, y0 + 0.08, TOP), P(x1, y0 + 0.08, TOP), P(x1, y1 - 0.08, TOP), P(x0, y1 - 0.08, TOP)];
    const legs = []; for (let x = x0 + (x0 === 0 ? 1.2 : 0.3); x < x1 - 1.2; x += 2.4) legs.push(x); legs.push(x1 - 0.3);
    let h = k.shadow([P(x0, y1), P(x1, y1), P(x1, y1 + 0.45), P(x0, y1 + 0.45)], 0.12);
    h += legs.map((x) => k.box(x, y0 + 0.06, 0, 0.12, 0.12, LEG, PAL.steel)).join("");
    h += k.box(x0, y0, LEG, x1 - x0, BW, TOP - LEG, PAL.steel) + k.wash(top, PAL.belt) + k.loop(top, { w: 1 });
    h += legs.map((x) => k.box(x, y1 - 0.18, 0, 0.12, 0.12, LEG, PAL.steel)).join("");
    let lines = "";
    for (let x = x0 - SLAT; x < x1; x += SLAT) { const a = P(x, y0 + 0.12, TOP), b = P(x, y1 - 0.12, TOP); lines += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`; }
    h += `<defs><clipPath id="${id}"><path d="${path(top)}"/></clipPath></defs><g clip-path="url(#${id})"><g class="slats"><path d="${lines}" stroke="#c9c2b8" stroke-width="1.3" opacity=".75" fill="none"/></g></g>`;
    const slats = k.node(layer, h).querySelector(".slats");
    return { x0, x1, y, at: (x, z = TOP) => P(x, y, z), update(t) { const ph = (V * t) % SLAT; slats.setAttribute("transform", `translate(${f(ph * CS * U)} ${f(ph * SN * U)})`); } };
  }
  /* a low table with a wooden top, the same height as a line: somewhere to keep things */
  function rack(layer, x0, x1, y) {
    const y0 = y - BW / 2;
    const legs = [x0 + 0.15, x1 - 0.27];
    return k.node(layer, k.shadow([P(x0, y0 + BW), P(x1, y0 + BW), P(x1, y0 + BW + 0.45), P(x0, y0 + BW + 0.45)], 0.12)
      + legs.map((x) => k.box(x, y0 + 0.06, 0, 0.12, 0.12, TOP - 0.18, PAL.woodDark)).join("")
      + k.box(x0, y0, TOP - 0.18, x1 - x0, BW, 0.18, PAL.wood)
      + legs.map((x) => k.box(x, y0 + BW - 0.18, 0, 0.12, 0.12, TOP - 0.18, PAL.woodDark)).join(""));
  }
  /* an open box on the floor; things dropped in go behind its front. Returns its middle. */
  function bin(L, x, y, w, d, h, col) {
    const c = k.crate(x, y, 0, w, d, h, col);
    k.node(L.under, k.shadow([P(x, y + d), P(x + w, y + d), P(x + w, y + d + 0.35), P(x, y + d + 0.35)]) + c.under);
    k.node(L.over, c.over);
    return { x: x + w / 2, y: y + d / 2, h, mouth: P(x + w / 2, y + d / 2, h - 0.05), floor: P(x + w / 2, y + d / 2, 0.1) };
  }

  /* ----- a worker: a paper doll that stands behind a line and works with its hands -----
     The line is at hip height. A thing that passes at x = worker.x + GAP is right in front of the worker.
     The worker moves the way a person does at a bench: the eyes go to a thing first, one hand reaches for it on a smooth
     path that starts and ends gently, the body bends at the waist towards the work, the elbows stay low and close,
     and a thing in a hand goes wherever that hand goes. An episode says where each hand should be and by when. */
  const GAP = 0.75, ARM = 17 * MAN, HIP = -12, NECK = -46;       // ARM is half the length of an arm; hips and neck in doll units
  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));    // the speed of a reaching hand: slow, fast, slow
  const at = (p, now) => (typeof p === "function" ? p(now) : p);
  function worker(L, o) {
    const foot = P(o.x, o.y, 0), [fx, fy] = foot, look = o.look ?? 0, coat = o.coat ?? PAL.blue, wide = 6.4 * MAN, phase = o.phase ?? 0;
    const body = k.node(L.dolls, `<g transform="scale(${MAN})">${k.doll({ look, coat })}</g>`, `transform="translate(${f(fx)} ${f(fy)})"`);
    const top = body.querySelector(".top"), head = body.querySelector(".head"), eyes = body.querySelector(".eyes");
    const arms = k.SHOULDER.map(() => k.node(L.arms, `<path class="ink" stroke-width="${f(wide + 2.6)}"/><path fill="none" stroke="${coat}" stroke-width="${f(wide)}" stroke-linecap="round" stroke-linejoin="round"/>${k.dot(0, 0, f(4.2 * MAN), PAL.skin[look], 1.2)}`));
    const rest = (i) => [fx + (i ? 17 : -17), fy - 19];            // hands at ease: low, at the worker's sides
    const hands = [0, 1].map((i) => ({ from: rest(i), to: rest(i), t0: -9, dur: 0.1, pos: rest(i), bend: 1 }));
    let lean = 0, tilt = 0, eye = [0, 0], gaze = null;
    return {
      foot, x: o.x, y: o.y, rest,
      /* the middle of a thing while it is worked on: in front of the belly, where hands work */
      hold: [fx, fy - 29],
      /* where hand i is now (0 is the hand on the left of the sheet) */
      at: (i) => hands[i].pos,
      /* send hand i to a point, or to a point that moves (a function of time), to arrive dur seconds from now; no point means back to rest */
      go(i, to, now, dur = 0.3) { const h = hands[i]; h.from = [h.pos[0], h.pos[1]]; h.to = to || rest(i); h.t0 = now; h.dur = Math.max(0.05, dur); },
      /* what the worker looks at: a point, a function of time, or nothing */
      look(p) { gaze = p; },
      pose(now, dt) {
        const q = (rate) => 1 - Math.exp(-dt * rate);
        hands.forEach((h) => { const e = smooth((now - h.t0) / h.dur), t = at(h.to, now) || h.pos; h.pos = [h.from[0] + (t[0] - h.from[0]) * e, h.from[1] + (t[1] - h.from[1]) * e]; });
        // the upper body bends at the hips towards where the hands are
        const mid = (hands[0].pos[0] + hands[1].pos[0]) / 2 - fx;
        lean += (Math.max(-7, Math.min(7, mid / 3.2)) - lean) * q(9);
        const a = (lean * Math.PI) / 180, breath = Math.sin(now * 1.9 + phase) * 0.45;
        top.setAttribute("transform", `translate(0 ${breath.toFixed(2)}) rotate(${lean.toFixed(2)} 0 ${HIP})`);
        const world = (x, y) => [fx + MAN * (x * Math.cos(a) - (y - HIP) * Math.sin(a)), fy + MAN * (HIP + breath + x * Math.sin(a) + (y - HIP) * Math.cos(a))];
        // the head tilts a little towards what the eyes are on; now and then the eyes blink
        const g = gaze && at(gaze, now), face = world(0, -56);
        let want = [0, 0], turn = 0;
        if (g) { const dx = g[0] - face[0], dy = g[1] - face[1], d = Math.hypot(dx, dy) || 1; want = [(dx / d) * 1.5, (dy / d) * 1.3]; turn = Math.max(-6, Math.min(6, dx / 7)); }
        tilt += (turn - tilt) * q(10); eye[0] += (want[0] - eye[0]) * q(16); eye[1] += (want[1] - eye[1]) * q(16);
        const shut = (now * 0.27 + phase * 0.31) % 1 < 0.03 ? 0.15 : 1;
        head.setAttribute("transform", `rotate(${tilt.toFixed(2)} 0 ${NECK})`);
        eyes.setAttribute("transform", `translate(${eye[0].toFixed(2)} ${(eye[1] - 55.5 * (shut - 1)).toFixed(2)}) scale(1 ${shut})`);
        // each arm: shoulder, elbow, hand. The elbow hangs low and close; an arm that comes towards the reader looks shorter.
        k.SHOULDER.forEach(([sx, sy], i) => {
          const side = i ? 1 : -1, h = hands[i], S = world(sx, sy), vx = h.pos[0] - S[0], vy = h.pos[1] - S[1], d = Math.hypot(vx, vy) || 1;
          const reach = Math.min(d, ARM * 2 - 0.6), H = [S[0] + (vx / d) * reach, S[1] + (vy / d) * reach], off = Math.min(Math.sqrt(Math.max(0, ARM * ARM - (reach * reach) / 4)), ARM * 0.4);
          const px = -vy / d, py = vx / d;
          h.bend += ((px * side * 0.6 + py * 0.8 >= 0 ? 1 : -1) - h.bend) * q(14);
          const E = [(S[0] + H[0]) / 2 + px * off * h.bend, (S[1] + H[1]) / 2 + py * off * h.bend], path = `M${f(S[0])} ${f(S[1])}L${f(E[0])} ${f(E[1])}L${f(H[0])} ${f(H[1])}`;
          const [outer, inner, palm] = arms[i].children;
          outer.setAttribute("d", path); inner.setAttribute("d", path); palm.setAttribute("cx", f(H[0])); palm.setAttribute("cy", f(H[1]));
        });
      },
    };
  }
  /* where a hand takes hold of a round thing r wide, measured from the middle of the thing: the first hand from above, the second from the side */
  const grasp = (i, r) => (i ? [r * 0.78, r * 0.1] : [-r * 0.5, -r * 0.5]);
  /* a thing in a hand goes where the hand goes */
  function give(it, who, i) { const r = it.r * U, g = grasp(i, r); it.hand = { who, i, off: [-g[0], r - g[1]] }; }
  const carried = (it) => { const h = it.hand.who.at(it.hand.i); return [h[0] + it.hand.off[0], h[1] + it.hand.off[1]]; };

  /* ----- things that travel ----- */
  const spark = (r) => `<path class="ink spark" d="M${f(-r * 1.25)} ${f(-r * 0.9)}L${f(-r * 1.75)} ${f(-r * 1.3)}M0 ${f(-r * 1.5)}L0 ${f(-r * 2.1)}M${f(r * 1.25)} ${f(-r * 0.9)}L${f(r * 1.75)} ${f(-r * 1.3)}" stroke-width="1.5"/>`;
  /* a small paper tag on a pin above a thing r tall-ish: a time stamp or a name */
  function flagArt(text, top, warn, pin = true) {
    const w = text.length * 8.6 + 12;
    return (pin ? `<path class="ink" d="M0 ${f(top)}L0 ${f(top - 9)}" stroke-width="1.1"/>` : "")
      + `<path d="M${f(-w / 2)} ${f(top - 27)}L${f(w / 2)} ${f(top - 27)}L${f(w / 2)} ${f(top - 9)}L${f(-w / 2)} ${f(top - 9)}Z" fill="${warn ? "#fbe1da" : PAL.white}" class="ink-f" stroke-width="1.1"${warn ? ' style="stroke:#c4604f"' : ""}/>`
      + `<text class="flag-t${warn ? " warn" : ""}" x="0" y="${f(top - 13.2)}" text-anchor="middle">${text}</text>`;
  }
  /* a yellow sticky note with its lower edge at y = bottom */
  function noteArt(text, bottom = 0) {
    const w = text.length * 8.6 + 12;
    return `<g transform="translate(0 ${f(bottom)}) rotate(-3)"><path d="M${f(-w / 2)} -18L${f(w / 2)} -18L${f(w / 2)} 0L${f(-w / 2)} 0Z" fill="#f6dc7f" class="ink-f" stroke-width="1.1"/><text class="flag-t" x="0" y="-4.4" text-anchor="middle">${text}</text></g>`;
  }
  /* What a thing carries: its tag, and a note that was stuck on. On a line they stand above the thing.
     In a worker's hands, and until the thing has moved clear of the worker, they hang below it, so that they do not cover the worker. */
  function tags(it, top, bottom) {
    if (!it.flag && !it.note) return "";
    const up = (it.flag ? flagArt(it.flag, top, it.warn) : "") + (it.note ? noteArt(it.note, top - (it.flag ? 28 : 9)) : "");
    const down = (it.flag ? flagArt(it.flag, bottom + 30, it.warn, false) : "") + (it.note ? noteArt(it.note, bottom + (it.flag ? 41 : 22)) : "");
    return `<g class="tag-up">${up}</g><g class="tag-down">${down}</g>`;
  }
  function candyArt(it) {
    const r = it.r * U, col = it.grey ? "#cfc8bd" : PAL[it.flavor], pts = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, q = r * (1 + 0.03 * Math.sin(i * 2.4 + it.id)); pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
    const ball = k.curve(pts, true);
    let h = `<ellipse class="cs" cx="${f(r * 0.25)}" cy="${f(r * 1.02)}" rx="${f(r * 1.05)}" ry="${f(r * 0.42)}" fill="#3d3631" opacity=".28"/>`;
    if (it.wrapped) {
      const tw = (s) => k.shape(`M${f(s * r * 0.8)} 0L${f(s * r * 1.85)} ${f(-r * 0.68)}L${f(s * r * 1.6)} 0L${f(s * r * 1.85)} ${f(r * 0.68)}Z`, k.lighter(col, 0.3), 1.2);
      const band = `M${f(-r * 0.34)} ${f(-r * 0.93)}Q${f(-r * 0.05)} 0 ${f(-r * 0.34)} ${f(r * 0.93)}`, band2 = `${f(r * 0.34)} ${f(r * 0.93)}Q${f(r * 0.63)} 0 ${f(r * 0.34)} ${f(-r * 0.93)}`;
      h += `<g transform="rotate(30)">${tw(-1)}${tw(1)}${k.shape(ball, col, 1.4)}<path d="${band}L${band2}Z" fill="${PAL.white}" opacity=".9"/><path class="ink" d="${band}M${band2}" stroke-width="1"/></g>`;
    } else {
      h += k.shape(ball, col, 1.4);
      h += `<path d="M${f(-r * 0.55)} ${f(-r * 0.25)}Q${f(-r * 0.5)} ${f(-r * 0.62)} ${f(-r * 0.12)} ${f(-r * 0.66)}" stroke="#fffaf0" stroke-width="${f(r * 0.2)}" stroke-linecap="round" fill="none" opacity=".75"/>`;
    }
    return `<g transform="translate(0 ${f(-r)})">${h}${spark(r)}</g>` + tags(it, -2 * r - 1, 0);
  }
  /* a paper cup, about as big as a candy */
  function cupArt(it) {
    const col = it.grey ? "#cfc8bd" : PAL[it.flavor], t = 14.5, b = 9.5, hgt = 21;
    let h = `<ellipse class="cs" cx="3" cy="1" rx="13" ry="5" fill="#3d3631" opacity=".28"/>`;
    h += k.shape(`M${-t} ${-hgt}L${-b} -2Q0 3 ${b} -2L${t} ${-hgt}Z`, col, 1.4);
    h += `<path class="ink" d="M-5.5 ${-hgt + 4}L-3.6 -1M5.5 ${-hgt + 4}L3.6 -1M0 ${-hgt + 5}L0 0" stroke-width=".9" opacity=".6"/>`;
    h += k.shape(`M${-t} ${-hgt}A${t} 5 0 1 0 ${t} ${-hgt}A${t} 5 0 1 0 ${-t} ${-hgt}Z`, k.darker(col, 0.35), 1.3);
    return h + `<g transform="translate(0 -10)">${spark(13)}</g>` + tags(it, -hgt - 6, 2);
  }
  const artOf = (it) => (it.kind === "cup" ? cupArt(it) : candyArt(it));
  /* make a candy or a cup. o: { kind, flavor, small, flag: text on a tag, warn: a red tag, note: text on a sticky note, grey: no longer of use } */
  function thing(layer, o) {
    const it = { id: ++uid, kind: "candy", wrapped: false, ...o }; it.r = it.small ? R_SMALL : R;
    it.el = k.node(layer, artOf(it));
    return it;
  }
  const redraw = (it) => { it.el.innerHTML = artOf(it); };
  /* put a thing at a sheet point. o: { s: scale, rot: degrees, air: off the line, busy: being worked on, low: its tags hang below it } */
  function put(it, p, o = {}) {
    it.pos = p;
    it.el.setAttribute("transform", `translate(${f(p[0])} ${f(p[1])})${o.rot ? ` rotate(${o.rot.toFixed(1)})` : ""}${o.s != null && o.s !== 1 ? ` scale(${o.s.toFixed(3)})` : ""}`);
    if (!!o.air !== !!it.air) { it.air = !!o.air; it.el.classList.toggle("air", it.air); }
    if (!!o.busy !== !!it.busy) { it.busy = !!o.busy; it.el.classList.toggle("busy", it.busy); }
    if (!!o.low !== !!it.low) { it.low = !!o.low; it.el.classList.toggle("low", it.low); }
  }
  /* A report card: a piece of paper that stands up and faces the reader.
     o.head: a first line of small text; o.parts: [{ flavor, n }]; o.pair: a flavor, drawn as a candy in its cup */
  function cardArt(o) {
    const parts = o.parts ?? [], w = Math.max(o.head ? o.head.length * 7.6 + 16 : 0, parts.length * 35 + 9, o.pair ? 40 : 0), h = (o.head ? 17 : 0) + (o.pair ? 36 : 27);
    let s = `<ellipse class="cs" cx="3" cy="1.5" rx="${f(w * 0.46)}" ry="4.5" fill="#3d3631" opacity=".22"/><path class="ink" d="M${f(-w * 0.28)} -4L${f(-w * 0.28 - 3)} 1.5M${f(w * 0.28)} -4L${f(w * 0.28 + 3)} 1.5" stroke-width="1.5"/>`;
    s += k.shape(`M${f(-w / 2)} ${-h - 4}L${f(w / 2)} ${-h - 4}L${f(w / 2)} -4L${f(-w / 2)} -4Z`, PAL.white, 1.3);
    if (o.head) s += `<text class="card-h" x="0" y="${-h + 9.5}" text-anchor="middle">${o.head}</text>`;
    parts.forEach((c, i) => { const x = -((parts.length - 1) * 35) / 2 + i * 35; s += k.dot(x - 8, -17.5, 6.5, PAL[c.flavor], 1.1) + `<text class="card-n" x="${f(x + 1.5)}" y="-12">${c.n}</text>`; });
    if (o.pair) { const col = PAL[o.pair]; s += k.shape("M-11 -26L-7 -9Q0 -6 7 -9L11 -26Z", k.lighter(col, 0.15), 1.2) + k.shape("M-8.5 -27A8.5 8.5 0 1 1 8.5 -27Z", col, 1.2); }
    return s;
  }
  const card = (layer, o) => { const c = { id: ++uid, ...o }; c.el = k.node(layer, cardArt(o)); return c; };

  /* ----- small moves: an element travels from one sheet point to another, on an arc if wanted ----- */
  function fly(el, a, b, t0, dur, o = {}) { const t = { el, a, b, t0, dur, ...o }; tweens.push(t); return t; }
  /* do something at a later moment; the moves of a worker are a row of such moments */
  const later = (t, fn) => jobs.push({ t, fn });
  function run(now) {
    for (;;) {
      let j = -1;
      jobs.forEach((q, i) => { if (q.t <= now && (j < 0 || q.t < jobs[j].t)) j = i; });
      if (j < 0) break;
      jobs.splice(j, 1)[0].fn(now);
    }
    const cur = tweens; tweens = [];          // a move that ends may start the next one, so new moves collect in a fresh list
    const keep = cur.filter((t) => {
      const u = (now - t.t0) / t.dur; if (u < 0) return true;
      const e = u >= 1 ? 1 : u * u * (3 - 2 * u), x = t.a[0] + (t.b[0] - t.a[0]) * e, y = t.a[1] + (t.b[1] - t.a[1]) * e - (t.arc ?? 0) * Math.sin(Math.PI * e);
      t.el.style.display = "";
      t.el.setAttribute("transform", `translate(${f(x)} ${f(y)})${t.scale ? ` scale(${(t.scale[0] + (t.scale[1] - t.scale[0]) * e).toFixed(3)})` : ""}`);
      if (t.it) t.it.pos = [x, y];
      if (u >= 1) { if (t.done) t.done(); return false; }
      return true;
    });
    tweens = keep.concat(tweens);
  }
  const reset = () => { tweens = []; jobs = []; };
  /* fall into a bin: over its edge, then down out of sight, then gone */
  function drop(it, from, b, now, done) {
    it.el.classList.add("air");
    fly(it.el, from, b.mouth, now, 0.42, { arc: 26, it, done: () => fly(it.el, b.mouth, b.floor, now + 0.42, 0.22, { it, done: () => { it.el.remove(); if (done) done(); } }) });
  }

  return { FX, FY, WH, TOP, BW, V, MAN, R, R_SMALL, FLAVORS, NAMES, GAP, path, onLeft, onBack, panel, room, clockHands, belt, rack, bin, worker, grasp, give, carried,
    thing, redraw, put, card, cardArt, flagArt, noteArt, fly, later, run, reset, drop };
};
