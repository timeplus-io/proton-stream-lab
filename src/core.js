/* Proton Stream Lab, shared runtime (needs d3 v7).
   Every episode uses the same pieces: a step runner, event blocks, output pills,
   a source tape that moves with processing time, a log, and the chapter UI. */
const SL = (() => {
  const CANCEL = { cancelled: true };
  let speed = 1;
  let runner = null;

  const d = (ms) => Math.max(0, ms / speed);
  const fmt = (t) => {
    const s = Math.max(0, t);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  };
  const keyColor = (k) => `var(--k-${String(k).toLowerCase()})`;

  /* Await a promise; throw CANCEL if the chapter was reset meanwhile. */
  async function W(p) {
    const g = runner ? runner.gen : 0;
    await p;
    if (runner && g !== runner.gen) throw CANCEL;
  }
  const sleep = (ms) => W(new Promise((r) => setTimeout(r, d(ms))));
  const all = (ps) => W(Promise.all(ps));

  function tr(sel, ms, ease = d3.easeCubicInOut) {
    return sel.transition().duration(d(ms)).ease(ease);
  }
  function done(t) { return t.end().catch(() => {}); }

  /* Move a <g> to (x,y) with optional scale; resolves when finished. */
  function move(sel, x, y, ms = 400, opts = {}) {
    const s = opts.scale ?? 1;
    sel.each(function () { this.__x = x; this.__y = y; });
    const tf = `translate(${x},${y}) scale(${s})`;
    if (ms <= 0) { sel.interrupt().attr("transform", tf); return Promise.resolve(); }
    return done(tr(sel, ms, opts.ease || d3.easeCubicInOut).attr("transform", tf));
  }
  function place(sel, x, y, s = 1) { sel.each(function () { this.__x = x; this.__y = y; }); sel.attr("transform", `translate(${x},${y}) scale(${s})`); return sel; }
  function pos(sel) { const n = sel.node(); return { x: n.__x ?? 0, y: n.__y ?? 0 }; }
  function reparent(sel, layer) { layer.node().appendChild(sel.node()); return sel; }
  function fadeOut(sel, ms = 350, dy = 0) {
    const n = sel.node(); if (!n) return Promise.resolve();
    const p = pos(sel);
    return done(tr(sel, ms).style("opacity", 0).attr("transform", `translate(${p.x},${p.y + dy}) scale(0.7)`)).then(() => sel.remove());
  }

  /* An event block. Color = key, shape = stream side (circle = left/main, square = right),
     number = event id, tag below = event time, optional value above. */
  function block(layer, ev, opts = {}) {
    const g = layer.append("g").attr("class", "blk").attr("data-uid", ev.uid || ev.id);
    if (ev.side === "R") g.append("rect").attr("class", "b-shape").attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22).attr("rx", 3);
    else g.append("circle").attr("class", "b-shape").attr("r", 11.5);
    g.select(".b-shape").style("fill", keyColor(ev.key));
    if (ev.replay) g.append("circle").attr("class", "b-replay").attr("r", 15.5);
    g.append("text").attr("class", "b-id").attr("dy", "0.36em").text(ev.id);
    if (opts.tag !== false && ev.et != null) g.append("text").attr("class", "b-tag").attr("y", 24).text(`${ev.et}s`);
    if (ev.val != null && opts.val !== false) g.append("text").attr("class", "b-val").attr("y", -16).text(ev.valText ?? ev.val);
    g.append("title").text(`event #${ev.id} · key ${ev.key}${ev.et != null ? ` · event time ${ev.et}s` : ""}${ev.val != null ? ` · value ${ev.valText ?? ev.val}` : ""}`);
    if (opts.x != null) place(g, opts.x, opts.y, opts.scale ?? 1);
    return g;
  }

  /* An output row. */
  function pill(layer, o) {
    const w = o.w || 272, h = 28;
    const g = layer.append("g").attr("class", "pill" + (o.dup ? " dup" : ""));
    g.append("rect").attr("class", "p-bg").attr("x", 0).attr("y", -h / 2).attr("width", w).attr("height", h).attr("rx", h / 2)
      .style("stroke", o.key ? keyColor(o.key) : "var(--line)");
    let x = 14;
    (o.marks || [{ key: o.key, side: "L" }]).forEach((m) => {
      if (m.side === "R") g.append("rect").attr("x", x - 6).attr("y", -6).attr("width", 12).attr("height", 12).attr("rx", 2).style("fill", keyColor(m.key));
      else g.append("circle").attr("cx", x).attr("cy", 0).attr("r", 6).style("fill", keyColor(m.key));
      x += 15;
    });
    g.append("text").attr("class", "p-txt").attr("x", x + 2).attr("dy", "0.35em").text(o.text);
    if (o.time != null) g.append("text").attr("class", "p-time").attr("x", w - 12).attr("dy", "0.35em").text(o.time);
    if (o.flag) g.append("text").attr("class", "p-flag").attr("x", w - 12).attr("y", -h / 2 - 3).attr("text-anchor", "end").text(o.flag);
    return g;
  }

  /* Output area that keeps the newest rows in a grid. */
  class OutGrid {
    constructor(layer, { x, y, cols, rows, cw, rh, w }) { Object.assign(this, { layer, x, y, cols, rows, cw, rh, w }); this.items = []; }
    slot(i) { return { x: this.x + (i % this.cols) * this.cw, y: this.y + Math.floor(i / this.cols) * this.rh }; }
    async add(o, from) {
      const ps = [];
      if (this.items.length >= this.cols * this.rows) {
        const drop = this.items.splice(0, this.cols);
        drop.forEach((g) => ps.push(fadeOut(g, 250)));
        this.items.forEach((g, i) => { const s = this.slot(i); ps.push(move(g, s.x, s.y, 300)); });
      }
      const g = pill(this.layer, { ...o, w: this.w });
      const i = this.items.length; this.items.push(g);
      const s = this.slot(i);
      place(g, from.x, from.y, 0.35);
      g.style("opacity", 0.2);
      g.transition("fade").duration(d(200)).style("opacity", 1);
      ps.push(move(g, s.x, s.y, 520, { ease: d3.easeCubicOut }));
      return W(Promise.all(ps));
    }
    clear() { this.items.forEach((g) => g.remove()); this.items = []; }
  }

  /* Source tape: future events wait to the left of "now", placed by arrival (processing) time. */
  class Tape {
    constructor(layer, clipLayer, { x0, nowX, y, pps, label, sub }) {
      Object.assign(this, { x0, nowX, y, pps });
      this.items = new Map();
      const L = layer.append("g").attr("class", "tape");
      L.append("rect").attr("class", "box-soft").attr("x", x0).attr("y", y - 24).attr("width", nowX - x0).attr("height", 48).attr("rx", 8);
      for (let s = 0; s * pps <= nowX - x0 - 4; s++) {
        const x = nowX - s * pps;
        L.append("line").attr("class", "tick").attr("x1", x).attr("x2", x).attr("y1", y + 24).attr("y2", y + 30);
        L.append("text").attr("class", "tick-lbl").attr("x", x).attr("y", y + 42).text(s === 0 ? "now" : `+${s}s`);
      }
      L.append("line").attr("class", "now-line").attr("x1", nowX).attr("x2", nowX).attr("y1", y - 30).attr("y2", y + 30);
      if (label) L.append("text").attr("class", "box-title").attr("x", x0).attr("y", y - 34).text(label);
      if (sub) L.append("text").attr("class", "box-sub").attr("x", x0).attr("y", y + 58).text(sub);
      const id = "clip" + Math.random().toString(36).slice(2, 8);
      layer.append("clipPath").attr("id", id).append("rect").attr("x", x0).attr("y", y - 40).attr("width", nowX - x0 + 14).attr("height", 80);
      this.layer = clipLayer.append("g").attr("clip-path", `url(#${id})`);
    }
    xFor(at, clock) { return this.nowX - (at - clock) * this.pps; }
    add(ev, clock) {
      const g = block(this.layer, ev);
      place(g, this.xFor(ev.at, clock), this.y);
      this.items.set(ev.uid || ev.id, { ev, g });
      return g;
    }
    advance(clock, ms) {
      const ps = [];
      this.items.forEach(({ ev, g }) => {
        const x = this.xFor(ev.at, clock);
        if (x < this.x0 - 60 && pos(g).x < this.x0 - 60) { place(g, x, this.y); return; }
        ps.push(move(g, x, this.y, ms, { ease: d3.easeLinear }));
      });
      return Promise.all(ps);
    }
    take(ev, toLayer) {
      const k = ev.uid || ev.id;
      const it = this.items.get(k); this.items.delete(k);
      if (!it) return null;
      it.g.interrupt();
      place(it.g, this.nowX, this.y);
      return reparent(it.g, toLayer);
    }
    clear() { this.items.forEach(({ g }) => g.remove()); this.items.clear(); }
  }

  function defs(svg) {
    const df = svg.append("defs");
    df.append("marker").attr("id", "arrow").attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5)
      .attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse")
      .append("path").attr("class", "arrowhead").attr("d", "M0,0 L10,5 L0,10 z");
    return df;
  }
  function boxWithTitle(layer, { x, y, w, h, title, sub }) {
    const g = layer.append("g");
    g.append("rect").attr("class", "box").attr("x", x).attr("y", y).attr("width", w).attr("height", h).attr("rx", 10);
    if (title) g.append("text").attr("class", "box-title").attr("x", x + 14).attr("y", y + 22).text(title);
    if (sub) g.append("text").attr("class", "box-sub").attr("x", x + 14).attr("y", y + 38).text(sub);
    return g;
  }
  function flowArrow(layer, x1, y1, x2, y2) {
    layer.append("path").attr("class", "flow").attr("d", `M${x1},${y1} L${x2},${y2}`);
  }
  function barrier(layer, n) {
    const g = layer.append("g").attr("class", "barrier");
    g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -18).attr("y2", 18);
    g.append("rect").attr("x", 0).attr("y", -30).attr("width", 50).attr("height", 15).attr("rx", 2);
    g.append("text").attr("x", 5).attr("y", -19).text(`ckpt ${n}`);
    return g;
  }
  function wmTag(layer) {
    const g = layer.append("g").attr("class", "wm-tag");
    g.append("rect").attr("x", -30).attr("y", -10).attr("width", 60).attr("height", 18).attr("rx", 3);
    g.append("text").attr("text-anchor", "middle").attr("dy", "0.32em").text("WM");
    return g;
  }

  /* Advance processing time to t: the tapes slide, the clock counts up. */
  function clockTo(A, tapes, t, onTick) {
    const from = A.clock;
    if (t <= from + 1e-9) return Promise.resolve();
    const ms = Math.min(1500, Math.max(160, (t - from) * 520));
    const ps = tapes.map((tp) => tp.advance(t, ms));
    const ticker = d3.select("#stage").transition("clock").duration(d(ms)).ease(d3.easeLinear)
      .tween("clock", () => (k) => { const v = from + (t - from) * k; A.setClock(v); if (onTick) onTick(v); });
    ps.push(done(ticker).then(() => { A.setClock(t); if (onTick) onTick(t); }));
    return W(Promise.all(ps));
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function sqlHtml(sql) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return sql.split("\n").map((line) => {
      const i = line.indexOf("--");
      const code = i >= 0 ? line.slice(0, i) : line;
      const cm = i >= 0 ? line.slice(i) : "";
      const kw = /\b(SELECT|FROM|WHERE|GROUP BY|AS|EMIT|PERIODIC|ON UPDATE|AFTER WINDOW CLOSE|WITH DELAY|WITH|DELAY|JOIN|LEFT|INNER|ON|AND|CREATE|MATERIALIZED VIEW|INTO|SETTINGS|ASOF|LATEST|CHANGELOG|STREAM|CASE|WHEN|THEN|ELSE|END)\b/g;
      return esc(code).replace(kw, '<span class="kw">$1</span>') + (cm ? `<span class="cm">${esc(cm)}</span>` : "");
    }).join("\n");
  }

  /* Chapter UI and transport. `ep` supplies chapters, setup(ch, opts) and handle(item). */
  function app(ep) {
    const $ = (s) => document.querySelector(s);
    let current = null;
    let clock = 0;
    const logEl = $("#log");
    const playBtn = $("#play"), stepBtn = $("#step"), restartBtn = $("#restart"), statusEl = $("#status");

    const ui = () => {
      const r = runner;
      playBtn.textContent = r.done ? "Done" : r.paused ? (r.started ? "Resume" : "Play") : "Pause";
      playBtn.disabled = r.done;
      stepBtn.disabled = r.done || !r.paused;
      statusEl.textContent = r.done ? "Finished. Restart or pick another chapter." : r.paused ? (r.started ? "Paused" : "Ready") : "Playing";
    };
    runner = new Runner(async (item) => { await ep.handle(item); }, ui);

    function log(msg) {
      const li = document.createElement("li");
      li.innerHTML = `<time>${fmt(clock)}</time><span></span>`;
      li.querySelector("span").textContent = msg;
      const empty = logEl.querySelector(".empty"); if (empty) empty.remove();
      logEl.prepend(li);
      while (logEl.children.length > 40) logEl.lastChild.remove();
    }
    function setClock(t) { clock = t; $("#clock").innerHTML = `<span>processing time</span> ${fmt(t)}`; }

    function renderChapterText(ch) {
      $("#ch-title").textContent = ch.title;
      $("#ch-sub").textContent = ch.sub || "";
      $("#ch-body").innerHTML = ch.body.map((p) => `<p>${p}</p>`).join("");
      $("#ch-watch").innerHTML = ch.watch.map((w) => `<li>${w}</li>`).join("");
      $("#ch-sql").innerHTML = sqlHtml(ch.sql);
      $("#ch-refs").innerHTML = (ch.refs || []).map((r) => `<li>${r}</li>`).join("");
      const pg = $("#playground");
      if (pg) { pg.hidden = !ch.playground; if (ch.playground && ep.renderPlayground) ep.renderPlayground(pg, () => load(current, true)); }
    }

    function load(ch, autoplay) {
      current = ch;
      document.querySelectorAll(".chap").forEach((b) => b.setAttribute("aria-current", b.dataset.id === ch.id ? "true" : "false"));
      try { localStorage.setItem(`sl-${ep.id}-chapter`, ch.id); } catch (e) {}
      if (location.hash !== "#" + ch.id) history.replaceState(null, "", "#" + ch.id);
      d3.select("#stage").interrupt("clock").selectAll("*").interrupt();
      logEl.innerHTML = '<li class="empty">Press Play, or Step to advance one event at a time.</li>';
      setClock(0);
      renderChapterText(ch);
      const queue = ep.setup(ch);
      runner.load(queue);
      if (autoplay && !matchMedia("(prefers-reduced-motion: reduce)").matches) runner.play();
    }

    const rail = $("#chapters");
    ep.chapters.forEach((ch, i) => {
      const b = document.createElement("button");
      b.className = "chap"; b.dataset.id = ch.id; b.type = "button";
      b.innerHTML = `<span class="n">${String(i + 1).padStart(2, "0")}</span><span>${ch.title}<small>${ch.short || ""}</small></span>`;
      b.addEventListener("click", () => load(ch, true));
      rail.appendChild(b);
    });
    playBtn.addEventListener("click", () => { runner.paused ? runner.play() : runner.pause(); });
    stepBtn.addEventListener("click", () => runner.step());
    restartBtn.addEventListener("click", () => load(current, false));
    document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
      speed = +b.dataset.s;
      document.querySelectorAll("#speed button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    }));
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,select,textarea")) return;
      if (e.code === "Space") { e.preventDefault(); runner.paused ? runner.play() : runner.pause(); }
      if (e.code === "ArrowRight") { e.preventDefault(); if (runner.paused) runner.step(); }
    });
    window.addEventListener("hashchange", () => {
      const c = ep.chapters.find((x) => "#" + x.id === location.hash);
      if (c && c !== current) load(c, false);
    });

    let start = ep.chapters.find((x) => "#" + x.id === location.hash);
    if (!start) { try { const s = localStorage.getItem(`sl-${ep.id}-chapter`); start = ep.chapters.find((x) => x.id === s); } catch (e) {} }
    load(start || ep.chapters[0], false);

    return { log, setClock, get clock() { return clock; }, get runner() { return runner; }, reload: () => load(current, true) };
  }

  class Runner {
    constructor(handler, ui) { this.handler = handler; this.ui = ui; this.gen = 0; this.queue = []; this.paused = true; this.waiters = []; this.done = false; }
    flush() { const w = this.waiters; this.waiters = []; w.forEach((r) => r()); }
    load(queue) { this.gen++; this.queue = queue; this.paused = true; this.done = false; this.started = false; this.stepOnce = false; this.flush(); this.loop(this.gen); this.ui(); }
    play() { if (this.done) return; this.started = true; this.paused = false; this.flush(); this.ui(); }
    pause() { this.paused = true; this.ui(); }
    step() { if (this.done) return; this.started = true; this.stepOnce = true; this.paused = false; this.flush(); this.ui(); }
    async loop(g) {
      while (g === this.gen) {
        if (this.paused) { await new Promise((r) => this.waiters.push(r)); continue; }
        const it = this.queue.shift();
        if (!it) { this.done = true; this.paused = true; this.ui(); await new Promise((r) => this.waiters.push(r)); continue; }
        try { await this.handler(it); } catch (e) { if (e === CANCEL) return; console.error(e); }
        if (g !== this.gen) return;
        if (this.stepOnce) { this.stepOnce = false; this.paused = true; }
        if (!this.queue.length) this.done = true, this.paused = true;
        this.ui();
      }
    }
  }

  return { CANCEL, W, sleep, all, tr, done, move, place, pos, reparent, fadeOut, block, pill, OutGrid, Tape, defs, boxWithTitle, flowArrow, barrier, wmTag, rng, clockTo, fmt, keyColor, app, d };
})();
