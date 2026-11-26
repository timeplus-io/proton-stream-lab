/* Stream Stories, shared kit: one hand-drawn sheet in plain SVG, no libraries.
   Everything is drawn twice, the way a marker sketch is made: a soft wash of colour with paper tooth in it,
   then a thin ink line that bows a little and runs past its corners. The scene is isometric but flat:
   P(x, y, z) turns a place in the room into a point on the sheet. People are small paper dolls that face the reader.
   An episode supplies scenes, init(kit, scene) and tick(dt, now); the story runs until the reader presses Pause. */
const Story = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const W = 1400, H = 800;
  const INK = "#3a3531";
  const PAL = {
    paper: "#faf5ea", floor: "#f1e7d2", wall: "#f6eedd", wood: "#dcbd90", woodDark: "#c19f72", base: "#c9aa7f",
    steel: "#c3c8c9", belt: "#8f8881", dark: "#4f4944", glass: "#bfd6d8", white: "#fefbf3",
    a: "#e59a62", b: "#72bbb0", c: "#ac92d6", red: "#d67c6c", yellow: "#ecc96e", blue: "#86a3c6", green: "#9dbb88", pink: "#efb9b3",
    skin: ["#f3ceac", "#dca97f", "#b07a57"], hair: ["#3f332d", "#7d4d2e", "#a59e95"],
  };
  const BASE = 12 * 3600;
  const hms = (t) => {
    const d = Math.floor(BASE + t + 1e-6);
    return [Math.floor(d / 3600), Math.floor((d % 3600) / 60), d % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  let rand = rng(1);
  const f = (n) => Math.round(n * 10) / 10;
  function mix(a, b, t) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), A = p(a), B = p(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  const lighter = (c, t = 0.4) => mix(c, "#fffaf0", t), darker = (c, t = 0.2) => mix(c, "#7a6753", t);

  /* ----- the isometric room: x runs down and right, y down and left, z up ----- */
  const CS = Math.cos(Math.PI / 6), SN = 0.5, U = 52, OX = 551, OY = 236;
  const P = (x, y, z = 0) => [OX + (x - y) * CS * U, OY + (x + y) * SN * U - z * U];

  /* ----- ink: every straight edge is ruled by hand, so it bows a little and overshoots ----- */
  function stroke(a, b, o = {}) {
    const over = o.over ?? 2.4, amp = o.amp ?? 0.9, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const o1 = over * rand(), o2 = over * rand(), bow = (rand() - 0.5) * 2 * amp * Math.min(1, L / 70);
    const A = [a[0] - ux * o1, a[1] - uy * o1], B = [b[0] + ux * o2, b[1] + uy * o2];
    return `M${f(A[0])} ${f(A[1])}Q${f((A[0] + B[0]) / 2 - uy * bow)} ${f((A[1] + B[1]) / 2 + ux * bow)} ${f(B[0])} ${f(B[1])}`;
  }
  const attr = (o) => ` stroke-width="${o.w ?? 1.25}"${o.col ? ` style="stroke:${o.col}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}`;
  const edges = (pairs, o = {}) => `<path class="ink" d="${pairs.map(([a, b]) => stroke(a, b, o)).join("")}"${attr(o)}/>`;
  const loop = (pts, o) => edges(pts.map((p, i) => [p, pts[(i + 1) % pts.length]]), o);
  /* a smooth line through points, for round things and leader lines */
  function curve(pts, closed = false) {
    const n = pts.length, g = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + (closed ? "Z" : "");
  }
  /* ----- wash: flat colour laid a touch off the line, with the paper showing through ----- */
  const tooth = (d) => `<path d="${d}" fill="url(#tooth)"/>`;
  function wash(pts, col, o = {}) {
    const j = o.j ?? 0.9, dx = (rand() - 0.5) * 1.4, dy = (rand() - 0.5) * 1.4;
    const d = "M" + pts.map((p) => f(p[0] + dx + (rand() - 0.5) * j) + " " + f(p[1] + dy + (rand() - 0.5) * j)).join("L") + "Z";
    return `<path d="${d}" fill="${col}"/>` + tooth(d);
  }
  /* a shape given as path data: washed, then inked */
  const shape = (d, col, w = 1.4) => `<path d="${d}" fill="${col}"/>${tooth(d)}<path class="ink" d="${d}" stroke-width="${w}"/>`;
  const dot = (x, y, r, col, w = 1.2) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${col}"${w ? ` class="ink-f" stroke-width="${w}"` : ""}/>`;
  const shadow = (pts, op = 0.13) => `<path d="M${pts.map((p) => f(p[0]) + " " + f(p[1])).join("L")}Z" fill="#5c5247" opacity="${op}"/>`;

  /* ----- solids ----- */
  /* A box standing at (x, y, z), w along x, d along y, h high. col is the face that looks down and right. */
  function box(x, y, z, w, d, h, col, o = {}) {
    const t = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], b1 = P(x + w, y, z), b2 = P(x + w, y + d, z), b3 = P(x, y + d, z);
    return wash(t, o.top ?? lighter(col)) + wash([t[1], t[2], b2, b1], col) + wash([t[3], t[2], b2, b3], o.side ?? darker(col))
      + edges([[t[0], t[1]], [t[1], t[2]], [t[2], t[3]], [t[3], t[0]], [t[1], b1], [t[2], b2], [t[3], b3], [b1, b2], [b2, b3]], { w: o.w });
  }
  /* An open box you can drop things into. under goes behind what falls in, over goes in front of it. */
  function crate(x, y, z, w, d, h, col) {
    const T = (px, py) => P(px, py, z + h), B = (px, py) => P(px, py, z), in1 = darker(col, 0.45), in2 = darker(col, 0.6);
    const under = wash([B(x, y), B(x + w, y), B(x + w, y + d), B(x, y + d)], darker(col, 0.75)) + wash([T(x, y), T(x, y + d), B(x, y + d), B(x, y)], in1) + wash([T(x, y), T(x + w, y), B(x + w, y), B(x, y)], in2)
      + edges([[T(x, y), T(x + w, y)], [T(x, y), T(x, y + d)], [T(x, y), B(x, y)]], { w: 1.1 });
    const over = wash([T(x + w, y), T(x + w, y + d), B(x + w, y + d), B(x + w, y)], col) + wash([T(x, y + d), T(x + w, y + d), B(x + w, y + d), B(x, y + d)], darker(col))
      + edges([[T(x + w, y), T(x + w, y + d)], [T(x + w, y + d), T(x, y + d)], [T(x + w, y), B(x + w, y)], [T(x + w, y + d), B(x + w, y + d)], [T(x, y + d), B(x, y + d)], [B(x + w, y), B(x + w, y + d)], [B(x + w, y + d), B(x, y + d)]]);
    return { under, over };
  }
  /* An upright cylinder: a can, a jar, a roll. */
  function cyl(x, y, z, r, h, col, o = {}) {
    const c0 = P(x, y, z), c1 = P(x, y, z + h), rx = f(Math.SQRT2 * CS * r * U), ry = f(Math.SQRT2 * SN * r * U);
    const body = `M${f(c1[0] - rx)} ${f(c1[1])}L${f(c0[0] - rx)} ${f(c0[1])}A${rx} ${ry} 0 0 0 ${f(c0[0] + rx)} ${f(c0[1])}L${f(c1[0] + rx)} ${f(c1[1])}A${rx} ${ry} 0 0 1 ${f(c1[0] - rx)} ${f(c1[1])}Z`;
    const top = `M${f(c1[0] - rx)} ${f(c1[1])}A${rx} ${ry} 0 1 0 ${f(c1[0] + rx)} ${f(c1[1])}A${rx} ${ry} 0 1 0 ${f(c1[0] - rx)} ${f(c1[1])}Z`;
    return shape(body, col, o.w ?? 1.2) + shape(top, o.top ?? lighter(col), o.w ?? 1.2);
  }

  /* ----- people: flat paper dolls, feet at (0, 0), about 86 tall with the hat ----- */
  function doll(o = {}) {
    const look = o.look ?? 0, skin = PAL.skin[look], hair = PAL.hair[look], coat = o.coat ?? PAL.blue;
    let h = `<ellipse cx="0" cy="1.5" rx="20" ry="6.5" fill="#8097b8" opacity=".5"/>`;
    [-1, 1].forEach((s) => {
      h += shape(`M${s * 6 - 3.2} -13L${s * 6 - 3.2} -3L${s * 6 + 3.2} -3L${s * 6 + 3.2} -13Z`, "#66738c", 1.2);
      h += shape(`M${s * 6 - 4.4} -3.4Q${s * 6 - 5} 0.8 ${s * 6} 0.8Q${s * 6 + 5} 0.8 ${s * 6 + 4.4} -3.4Z`, "#9a6b4c", 1.2);
    });
    h += shape("M-8.5 -45C-13.5 -45 -15 -40 -16 -34L-20 -15C-21.5 -9 -17 -8.5 -12 -8.5L12 -8.5C17 -8.5 21.5 -9 20 -15L16 -34C15 -40 13.5 -45 8.5 -45Z", coat, 1.5);
    if (o.apron !== false) h += shape("M-6.5 -39L6.5 -39L10.5 -11.5L-10.5 -11.5Z", PAL.white, 1.1);
    h += shape("M-13.6 -57A13.6 13.6 0 1 0 13.6 -57A13.6 13.6 0 1 0 -13.6 -57Z", skin, 1.5);
    h += `<path d="M-13.4 -59C-14 -66 -8 -70.5 0 -70.5C8 -70.5 14 -66 13.4 -59C9 -62.5 4 -63.5 0 -63.5C-4 -63.5 -9 -62.5 -13.4 -59Z" fill="${hair}"/>`;
    h += dot(-5, -55.5, 1.7, INK, 0) + dot(5, -55.5, 1.7, INK, 0);
    h += `<circle cx="-8.6" cy="-51.4" r="3.1" fill="#ee9f97" opacity=".6"/><circle cx="8.6" cy="-51.4" r="3.1" fill="#ee9f97" opacity=".6"/>`;
    h += `<path class="ink" d="M-3 -50.2Q0 -47.6 3 -50.2" stroke-width="1.2"/>`;
    if (o.hat !== false) {
      h += shape("M-10.5 -67C-17.5 -70 -16 -82.5 -6.5 -80.5C-4 -87 6 -87 8 -80.5C16.5 -82.5 17.5 -70 10.5 -67Z", PAL.white, 1.4);
      h += shape("M-11 -70L11 -70L11 -64.5L-11 -64.5Z", PAL.white, 1.2);
    }
    return h;
  }
  /* One arm, hanging from (0, 0). The episode turns it about the shoulder. tool: "paddle" for a small wooden pusher. */
  function arm(o = {}) {
    let h = "";
    if (o.tool === "paddle") h += `<path class="ink" d="M0 22L0 41" stroke-width="2.2" style="stroke:#8a6a48"/>` + shape("M-6.5 38L6.5 38L6.5 48L-6.5 48Z", PAL.wood, 1.2);
    h += shape("M-3.8 0L-3.8 20A3.8 3.8 0 0 0 3.8 20L3.8 0A3.8 3.8 0 0 0 -3.8 0Z", o.coat ?? PAL.blue, 1.3);
    return h + dot(0, 23, 4.1, PAL.skin[o.look ?? 0], 1.2);
  }
  const SHOULDER = [[-13, -39], [13, -39]];   // where the arms hang from, before the doll is scaled

  /* ----- the sheet ----- */
  let stageEl, back, live, labelLayer = null, labels = [], tight = null;
  /* Paper tooth: a small tile of soft noise, made once. Some patches dry lighter and some pool darker, as marker does on paper. */
  function toothTile() {
    const n = 256, c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d"), img = g.createImageData(n, n), r = rng(11);
    const lattice = (m) => {
      const a = new Float32Array(m * m).map(() => r()), v = (i, j) => a[(((j % m) + m) % m) * m + (((i % m) + m) % m)];
      return (x, y) => { const fx = (x / n) * m, fy = (y / n) * m, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy; };
    };
    const n1 = lattice(5), n2 = lattice(12), n3 = lattice(40);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 0.5 * n1(x, y) + 0.3 * n2(x, y) + 0.2 * n3(x, y), grain = r(), i = (y * n + x) * 4, pale = v < 0.44;
      const a = pale ? (0.44 - v) * 0.75 : (v - 0.52) * 0.42;
      img.data[i] = pale ? 255 : 96; img.data[i + 1] = pale ? 250 : 76; img.data[i + 2] = pale ? 238 : 60;
      img.data[i + 3] = Math.max(0, Math.min(1, a + (grain > 0.92 ? 0.035 : 0))) * 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  function setup(el) {
    stageEl = el;
    const mk = (cls) => { const s = document.createElementNS(NS, "svg"); s.setAttribute("class", cls); s.setAttribute("viewBox", `0 0 ${W} ${H}`); el.appendChild(s); return s; };
    back = mk("back"); live = mk("live");
    back.setAttribute("role", "img"); back.setAttribute("aria-label", "Hand-drawn factory scene");
    window.addEventListener("resize", layout);
  }
  /* On a wide page the whole sheet shows, labels in the margins. On a phone the sheet closes in on the room and the labels step aside. */
  function layout() {
    const compact = stageEl.clientWidth < 720 && tight, v = compact ? tight : [0, 0, W, H];
    stageEl.classList.toggle("compact", !!compact);
    [back, live].forEach((s) => s.setAttribute("viewBox", v.join(" ")));
    stageEl.style.aspectRatio = `${v[2]} / ${v[3]}`;
  }
  const g = (parent, html = "", attrs = "") => { parent.insertAdjacentHTML("beforeend", `<g ${attrs}>${html}</g>`); return parent.lastElementChild; };
  /* the paper: a faint isometric grid and a few pencil crosses */
  function paper() {
    let d = "";
    for (let k = -30; k <= 60; k++) { const a = P(k * 2, -40), b = P(k * 2, 60), c = P(-40, k * 2), e = P(60, k * 2); d += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}M${f(c[0])} ${f(c[1])}L${f(e[0])} ${f(e[1])}`; }
    let h = `<path d="${d}" stroke="${INK}" stroke-width=".7" opacity=".055" fill="none"/>`;
    [[120, 560], [1296, 500], [236, 742], [1160, 70], [1040, 770], [300, 84]].forEach(([x, y]) => { h += `<path class="ink" d="M${x - 6} ${y}L${x + 6} ${y}M${x} ${y - 6}L${x} ${y + 6}" stroke-width=".9" opacity=".55"/>`; });
    return h;
  }
  /* Margin notes. list = [{ title, note, x, y, side: "start" | "end", to: [sheet x, sheet y] }] */
  function setLabels(list) {
    labels = list; if (!labelLayer) return;
    labelLayer.innerHTML = list.map((l, i) => `<text class="lab-t" data-i="${i}" x="${l.x}" y="${l.y}" text-anchor="${l.side}">${l.title}</text><text class="lab-n" x="${l.x}" y="${l.y + 22}" text-anchor="${l.side}">${l.note}</text>`).join("");
    let h = ""; rand = rng(5);
    labelLayer.querySelectorAll(".lab-t").forEach((t) => {
      const l = list[+t.dataset.i], w = t.getComputedTextLength(), wn = t.nextElementSibling.getComputedTextLength(), s = l.side === "start" ? 1 : -1;
      const a = [l.x + s * (w + 13), l.y - 7], b = [a[0] + s * Math.max(30, wn - w + 8), a[1] + (rand() - 0.5) * 2], m = [(b[0] + l.to[0]) / 2 + (rand() - 0.5) * 5, (b[1] + l.to[1]) / 2 + (rand() - 0.5) * 5];
      h += `<path class="lead" d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}Q${f(m[0])} ${f(m[1])} ${f(l.to[0])} ${f(l.to[1])}"/>`;
      h += `<circle class="ring" cx="${f(a[0])}" cy="${f(a[1])}" r="3"/><circle class="ring" cx="${f(l.to[0])}" cy="${f(l.to[1])}" r="2.6"/>`;
    });
    labelLayer.insertAdjacentHTML("afterbegin", h);
  }

  function start(ep) {
    setup(document.querySelector("#stage"));
    let sceneDef = ep.scenes[0], paused = false, now = 0, last = null;
    const playBtn = document.querySelector("#play"), timeEl = document.querySelector("#time"), statusEl = document.querySelector("#status");
    const tile = toothTile();
    const kit = {
      PAL, INK, P, U, CS, SN, rng, mix, lighter, darker, f,
      edges, loop, curve, wash, shape, dot, shadow, box, crate, cyl, doll, arm, SHOULDER, setLabels,
      /* draw into the still part of the sheet, behind everything that moves */
      still: (html) => back.insertAdjacentHTML("beforeend", html),
      /* a new layer in the moving part of the sheet; layers stack in the order they are made */
      layer: (html = "", attrs = "") => g(live, html, attrs),
      node: g,
      labelLayer: () => { labelLayer = g(live, "", 'class="labels"'); setLabels(labels); return labelLayer; },
      seed: (s) => { rand = rng(s); },
      /* the part of the sheet a phone shows: [x, y, w, h] */
      focus: (v) => { tight = v; layout(); },
    };
    function load(s) {
      sceneDef = s; now = 0; labelLayer = null; labels = []; rand = rng(3);
      document.querySelectorAll("#scenes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === s.id ? "true" : "false"));
      document.querySelector("#story").innerHTML = s.story;
      back.innerHTML = `<defs><pattern id="tooth" patternUnits="userSpaceOnUse" width="256" height="256"><image href="${tile}" width="256" height="256"/></pattern></defs>` + paper();
      live.innerHTML = "";
      ep.init(kit, s);
      layout(); draw();
    }
    function draw() {
      timeEl.textContent = hms(now);
      if (ep.status) statusEl.textContent = ep.status();
    }
    const seg = document.querySelector("#scenes");
    ep.scenes.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.id = s.id; b.innerHTML = `<i>${i + 1}</i>${s.label}`;
      b.addEventListener("click", () => load(s)); seg.appendChild(b);
    });
    const setPaused = (p) => { paused = p; playBtn.textContent = p ? "Play" : "Pause"; };
    playBtn.addEventListener("click", () => setPaused(!paused));
    document.addEventListener("keydown", (e) => { if (e.code === "Space" && !e.target.closest("button,input,select")) { e.preventDefault(); setPaused(!paused); } });
    document.addEventListener("visibilitychange", () => { last = null; });
    load(sceneDef);
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setLabels(labels));
    function frame(t) {
      requestAnimationFrame(frame);
      if (last == null) { last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (paused) return;
      now += dt; ep.tick(dt, now); draw();
    }
    requestAnimationFrame(frame);
  }

  return { start, PAL, hms, rng };
})();
