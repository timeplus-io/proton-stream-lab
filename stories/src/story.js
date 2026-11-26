/* Stream Stories, shared kit (needs three.js r128 as the global THREE).
   One diorama seen from a fixed isometric camera: flat colors, thin ink outlines, soft shadows.
   An episode supplies scenes, init(kit, scene) and tick(dt, now); the story runs until the reader presses Pause. */
const Story = (() => {
  const INK = 0x3b3632;
  const C = {
    floor: 0xe9e1d0, base: 0xb9a07a, wall: 0xf5f0e6, belt: 0x5f5b58, slat: 0x77726d, frame: 0xa9b1b5, leg: 0x7c858b,
    wood: 0xd3ab78, woodDark: 0xb58c5a, white: 0xfbf8f1, dark: 0x4a4541, glass: 0xbfd6dc,
    a: 0xd9793b, b: 0x4ba39b, c: 0x9270c4, red: 0xc4604f, yellow: 0xe3b64f, blue: 0x5e7fa8, green: 0x7fa56b,
    skin: [0xe9b994, 0xc98f6b, 0x8e5b3f], hair: [0x2e2622, 0x5a3a26, 0x8f8a84],
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

  /* ----- drawing: every solid is a flat color with an ink outline ----- */
  const mats = new Map();
  const mat = (color) => { if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color })); return mats.get(color); };
  const inkMat = new THREE.LineBasicMaterial({ color: INK });
  function solid(geo, color, o = {}) {
    const m = new THREE.Mesh(geo, mat(color));
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    if (o.ink !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, o.angle ?? 30), inkMat));
    return m;
  }
  /* a box that stands on y = 0 */
  function box(w, h, d, color, o) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return solid(g, color, o); }
  /* a cylinder (or cone) that stands on y = 0 */
  /* Round things get their outline from a slightly larger ink shell seen from behind. */
  const hullMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const LINE = 0.022;
  function cyl(rt, rb, h, color, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 14); g.translate(0, h / 2, 0);
    const m = solid(g, color, o);
    if (o.ink !== false) { const hg = new THREE.CylinderGeometry(rt + LINE, rb + LINE, h + LINE * 2, o.seg ?? 14); hg.translate(0, h / 2, 0); m.add(new THREE.Mesh(hg, hullMat)); }
    return m;
  }
  function ball(r, color, o = {}) {
    const m = solid(new THREE.SphereGeometry(r, o.seg ?? 18, o.rings ?? 12), color, { ...o, ink: false });
    if (o.ink !== false) m.add(new THREE.Mesh(new THREE.SphereGeometry(r + LINE, o.seg ?? 18, o.rings ?? 12), hullMat));
    return m;
  }
  const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
  function group(...kids) { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; }

  /* ----- props ----- */
  /* The floor slab: a light top on a darker base, like a slice cut out of a building. Its top is y = 0. */
  function slab(w, d) {
    return group(at(box(w, 0.3, d, C.floor), 0, -0.3, 0), at(box(w, 0.55, d, C.base), 0, -0.85, 0));
  }
  /* Two walls of a cut-away room: the back wall and the left wall, with an opening where a line comes through. */
  function walls(w, d, h, hatch) {
    const t = 0.28, g = new THREE.Group();
    g.add(at(box(w + t, h, t, C.wall), -t / 2, 0, -d / 2 - t / 2));
    const x = -w / 2 - t / 2;
    if (!hatch) g.add(at(box(t, h, d, C.wall), x, 0, 0));
    else {
      const z0 = hatch.z - hatch.w / 2, z1 = hatch.z + hatch.w / 2;
      g.add(at(box(t, h, z0 + d / 2, C.wall), x, 0, (z0 - d / 2) / 2));
      g.add(at(box(t, h, d / 2 - z1, C.wall), x, 0, (z1 + d / 2) / 2));
      g.add(at(box(t, hatch.y0, hatch.w, C.wall), x, 0, hatch.z));
      g.add(at(box(t, h - hatch.y1, hatch.w, C.wall), x, hatch.y1, hatch.z));
      g.add(at(box(0.9, hatch.y1 - hatch.y0 + 0.5, hatch.w + 0.5, C.dark, { ink: false }), x - 0.6, hatch.y0 - 0.25, hatch.z));   // the dark room behind
    }
    return g;
  }
  /* A conveyor from x0 to x1 at depth z. Its slats move with the items, so the line visibly runs. */
  function belt(x0, x1, z, speed, o = {}) {
    const top = o.top ?? 1.05, w = o.w ?? 1.15, L = x1 - x0, g = new THREE.Group();
    g.add(at(box(L, 0.2, w + 0.16, C.frame), (x0 + x1) / 2, top - 0.26, z));
    g.add(at(box(L, 0.06, w, C.belt, { ink: false }), (x0 + x1) / 2, top - 0.06, z));
    for (let x = x0 + 0.7; x < x1; x += 2.2) [-1, 1].forEach((s) => g.add(at(box(0.14, top - 0.26, 0.14, C.leg), x, 0, z + s * (w / 2 - 0.05))));
    g.add(at(cyl(0.16, 0.16, w + 0.16, C.leg, { seg: 10 }), x1, top - 0.16, z - (w + 0.16) / 2).rotateX(Math.PI / 2));
    const gap = 0.55, slats = [];
    for (let i = 0; i < Math.floor(L / gap); i++) { const s = box(0.05, 0.012, w - 0.1, C.slat, { ink: false, cast: false }); s.position.set(0, top, z); g.add(s); slats.push(s); }
    const n = slats.length;
    return { group: g, top, z, x0, x1, update(now) { slats.forEach((s, i) => { s.position.x = x0 + (((i * gap + now * speed) % (n * gap)) + n * gap) % (n * gap); }); } };
  }
  /* A small person. look: 0..2 picks skin and hair; coat is the color of the work coat. */
  function person(o = {}) {
    const look = o.look ?? 0, g = new THREE.Group(), body = new THREE.Group();
    body.add(cyl(0.2, 0.31, 0.78, o.coat ?? C.blue));
    body.add(at(cyl(0.32, 0.32, 0.06, C.dark, { ink: false }), 0, 0, 0));
    const head = at(ball(0.2, C.skin[look]), 0, 0.98, 0);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(C.hair[look]));
    hair.position.set(0, 0.99, -0.02); hair.rotation.x = -0.5;
    const hat = at(cyl(0.17, 0.15, 0.2, C.white), 0, 1.13, 0);
    const eyes = [-1, 1].map((s) => at(ball(0.022, C.dark, { ink: false, cast: false }), s * 0.075, 1.0, 0.185));
    const arms = [-1, 1].map((s) => { const a = new THREE.Group(); a.position.set(s * 0.25, 0.7, 0); a.add(at(box(0.1, 0.36, 0.1, o.coat ?? C.blue), 0, -0.36, 0)); a.add(at(ball(0.065, C.skin[look], { ink: false }), 0, -0.4, 0)); body.add(a); return a; });
    body.add(head, hair, ...eyes); if (o.hat !== false) body.add(hat);
    g.add(body);
    return { group: g, body, head, arms };
  }
  /* A wall clock that faces +z. Its long hand goes round once a minute. */
  function clock(r = 0.62) {
    const g = new THREE.Group();
    const face = cyl(r, r, 0.08, C.white, { seg: 28 }); face.rotation.x = Math.PI / 2; g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 28), mat(C.dark)); rim.position.z = 0.08; g.add(rim);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, t = at(box(0.03, i % 3 === 0 ? 0.12 : 0.06, 0.01, C.dark, { ink: false, cast: false }), 0, 0, 0); t.position.set(Math.sin(a) * r * 0.8, Math.cos(a) * r * 0.8 - (i % 3 === 0 ? 0.06 : 0.03), 0.09); g.add(t); }
    const hand = (len, w, color) => { const p = new THREE.Group(); p.position.z = 0.1; p.add(box(w, len, 0.012, color, { ink: false, cast: false })); g.add(p); return p; };
    const minute = hand(r * 0.5, 0.05, C.dark), second = hand(r * 0.78, 0.03, C.red);
    g.add(at(ball(0.045, C.dark, { ink: false, cast: false }), 0, 0, 0.11));
    return { group: g, update(now) { second.rotation.z = -(now % 60) / 60 * Math.PI * 2; minute.rotation.z = -((now / 60) % 60) / 60 * Math.PI * 2; } };
  }
  /* An open wooden crate: a floor and four low sides. */
  function crate(w, h, d, color = C.wood) {
    const t = 0.07, g = new THREE.Group();
    g.add(box(w, t, d, C.woodDark));
    [[0, -d / 2 + t / 2, w, t], [0, d / 2 - t / 2, w, t], [-w / 2 + t / 2, 0, t, d], [w / 2 - t / 2, 0, t, d]].forEach(([x, z, sw, sd]) => g.add(at(box(sw, h, sd, color), x, 0, z)));
    return g;
  }

  /* ----- the stage: renderer, camera, labels ----- */
  let renderer, scene, camera, world, stageEl, leaders, tags = [], fit = null, raw = null;
  const AZ = Math.PI / 4, EL = (30 * Math.PI) / 180;
  const DIR = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), Math.cos(EL) * Math.cos(AZ));

  function setup(el) {
    stageEl = el;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { renderer = null; }
    if (!renderer) { el.innerHTML = '<p class="nogl">This story needs WebGL, which is not available in this browser.</p>'; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Animated factory diorama");
    leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg"); leaders.setAttribute("class", "leaders"); el.appendChild(leaders);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.36));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cdb6, 0.45));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.34);
    sun.position.set(6, 14, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.bias = -0.0015; sun.shadow.radius = 3;
    scene.add(sun);
    camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
    world = new THREE.Group(); scene.add(world);
    window.addEventListener("resize", layout);
    return true;
  }
  /* Frame the diorama: box = [x0, x1, y0, y1, z0, z1] in world units, padX = empty paper left and right for the labels. */
  function frame(box, padX = 0.24, padY = 0.05) {
    const [x0, x1, y0, y1, z0, z1] = box, c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    camera.position.copy(c).addScaledVector(DIR, 40); camera.up.set(0, 1, 0); camera.lookAt(c); camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse; let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
    [x0, x1].forEach((x) => [y0, y1].forEach((y) => [z0, z1].forEach((z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); l = Math.min(l, v.x); r = Math.max(r, v.x); b = Math.min(b, v.y); t = Math.max(t, v.y); })));
    raw = { l, r, b, t, padX, padY };
    layout();
  }
  /* On a wide page the diorama leaves paper on both sides for the labels. On a phone it fills the width and the labels step aside. */
  function layout() {
    if (!renderer || !raw) return;
    const compact = stageEl.clientWidth < 720, w0 = raw.r - raw.l, h0 = raw.t - raw.b, px = compact ? 0.02 : raw.padX;
    stageEl.classList.toggle("compact", compact);
    fit = { l: raw.l - w0 * px, r: raw.r + w0 * px, b: raw.b - h0 * raw.padY, t: raw.t + h0 * raw.padY };
    Object.assign(camera, { left: fit.l, right: fit.r, top: fit.t, bottom: fit.b }); camera.updateProjectionMatrix();
    const w = stageEl.clientWidth, h = Math.round(w * (fit.t - fit.b) / (fit.r - fit.l));
    renderer.setSize(w, h, false); renderer.domElement.style.height = h + "px";
    placeTags();
    if (scene) renderer.render(scene, camera);
  }
  const toScreen = (p) => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera), el = renderer.domElement; return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight]; };
  /* Labels in the paper margin, each tied by a thin line to the thing it names.
     list = [{ title, sub, at: [x, y, z], side: "left" | "right", y: fraction of the stage height }] */
  function setTags(list) {
    tags.forEach((t) => t.el.remove());
    tags = list.map((t) => {
      const el = document.createElement("div"); el.className = "tag " + t.side;
      el.innerHTML = `<b>${t.title}</b><span>${t.sub}</span>`; stageEl.appendChild(el);
      return { ...t, el };
    });
    placeTags();
  }
  function placeTags() {
    if (!renderer) return;
    const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight; let d = "";
    tags.forEach((t) => {
      t.el.style.top = t.y * H + "px";
      if (t.side === "left") { t.el.style.left = "4px"; t.el.style.right = ""; } else { t.el.style.right = "4px"; t.el.style.left = ""; }
      const bw = t.el.querySelector("b").getBoundingClientRect().width, r0 = stageEl.getBoundingClientRect(), rb = t.el.querySelector("b").getBoundingClientRect();
      const sy = rb.top - r0.top + rb.height / 2, sx = t.side === "left" ? rb.left - r0.left + bw + 12 : rb.left - r0.left - 12;
      const [ax, ay] = toScreen(t.at), ex = sx + (t.side === "left" ? 26 : -26);
      d += `<path d="M${sx},${sy} H${ex} L${ax},${ay}"/><circle cx="${sx}" cy="${sy}" r="2.6"/><circle cx="${ax}" cy="${ay}" r="2.2"/>`;
    });
    leaders.innerHTML = d;
  }

  /* Take an object off the stage and free what it drew with. */
  function drop(obj) {
    obj.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    if (obj.parent) obj.parent.remove(obj);
  }

  function start(ep) {
    if (!setup(document.querySelector("#stage"))) return;
    let sceneDef = ep.scenes[0], paused = false, now = 0, last = null;
    const playBtn = document.querySelector("#play"), timeEl = document.querySelector("#time"), statusEl = document.querySelector("#status");
    const kit = { THREE, C, world, box, cyl, ball, at, group, solid, drop, slab, walls, belt, person, clock, crate, frame, setTags, rng };
    function load(s) {
      sceneDef = s; now = 0;
      document.querySelectorAll("#scenes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === s.id ? "true" : "false"));
      document.querySelector("#story").innerHTML = s.story;
      while (world.children.length) drop(world.children[0]);
      ep.init(kit, s);
      draw();
    }
    function draw() {
      timeEl.textContent = hms(now);
      if (ep.status) statusEl.textContent = ep.status();
      renderer.render(scene, camera);
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
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeTags);
    function loop(t) {
      requestAnimationFrame(loop);
      if (last == null) { last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (paused) return;
      now += dt; ep.tick(dt, now); draw();
    }
    requestAnimationFrame(loop);
  }

  return { start, C, hms, rng };
})();
