/* Proton Stream Lab, simple runtime (needs d3 v7).
   A continuous simulation: an episode supplies modes, init(mode) and tick(dt, now).
   The loop runs until the viewer presses Pause. */
const Lab = (() => {
  const CARD = { w: 122, h: 74 };
  const BASE = 12 * 3600; // processing clock starts at 12:00:00
  const keyColor = (k) => `var(--k-${String(k).toLowerCase()})`;
  const hms = (t) => {   // truncated to tenths, so 59.97 s never prints as 60.0
    const d = Math.floor((BASE + t) * 10 + 1e-6);
    const h = Math.floor(d / 36000), m = Math.floor((d % 36000) / 600), sec = (d % 600) / 10;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
  };

  /* A data card: three lines, all of the event's data. Color = key.
     Rounded = main/left stream, square corners = right stream of a join,
     rounded left + square right = a joined record. */
  function card(layer, ev) {
    const { w, h } = CARD, x0 = -w / 2, y0 = -h / 2;
    const g = layer.append("g").attr("class", "card");
    const rx = ev.side === "R" ? 3 : 12;
    if (ev.side === "J") {
      const r = 12, q = 3;
      g.append("path").attr("class", "body").style("fill", keyColor(ev.key))
        .attr("d", `M${x0 + r},${y0} H${x0 + w - q} a${q},${q} 0 0 1 ${q},${q} V${y0 + h - q} a${q},${q} 0 0 1 ${-q},${q} H${x0 + r} a${r},${r} 0 0 1 ${-r},${-r} V${y0 + r} a${r},${r} 0 0 1 ${r},${-r} Z`);
    } else g.append("rect").attr("class", "body").attr("x", x0).attr("y", y0).attr("width", w).attr("height", h).attr("rx", rx).style("fill", keyColor(ev.key));
    g.append("rect").attr("class", "c-flash").attr("x", x0 - 3).attr("y", y0 - 3).attr("width", w + 6).attr("height", h + 6).attr("rx", rx + 2);
    g.append("text").attr("class", "c-id").attr("x", x0 + 12).attr("y", y0 + 20);
    g.append("text").attr("class", "c-val").attr("x", x0 + 12).attr("y", 9);
    g.append("text").attr("class", "c-time").attr("x", x0 + 12).attr("y", h / 2 - 10);
    if (ev.noteText) g.append("text").attr("class", "c-note").attr("x", x0 + 12).attr("y", h / 2 + 15).text(ev.noteText);   // a remark about the card, not part of its data
    fill(g, ev);
    return g;
  }
  function fill(g, ev) {
    const label = ev.keyLabel || ev.key;
    const title = ev.title ?? `#${ev.id} · ${label}`;
    const time = ev.timeText ?? hms(ev.et).slice(0, 8);
    g.select(".c-id").text(title);
    g.select(".c-val").text(ev.valText);
    g.select(".c-time").text(time);
    g.select("title").remove();
    g.append("title").text(`${title}, ${ev.valText}, ${time}`);
  }

  /* A state card: what an operator keeps in memory for one key. Same size as a data card, but hollow.
     rows = [{ l: label, r: number }], at most two. */
  function stateCard(layer, key, title) {
    const { w, h } = CARD, x0 = -w / 2, y0 = -h / 2;
    const g = layer.append("g").attr("class", "state");
    g.append("rect").attr("class", "body").attr("x", x0).attr("y", y0).attr("width", w).attr("height", h).attr("rx", 12).style("stroke", keyColor(key));
    g.append("rect").attr("class", "c-flash").attr("x", x0 - 3).attr("y", y0 - 3).attr("width", w + 6).attr("height", h + 6).attr("rx", 14);
    g.append("text").attr("class", "s-title").attr("x", x0 + 12).attr("y", y0 + 20).style("fill", keyColor(key)).text(title);
    [0, 1].forEach((i) => {
      g.append("text").attr("class", `s-l s-l${i}`).attr("x", x0 + 12);
      g.append("text").attr("class", `s-r s-r${i}`).attr("x", w / 2 - 12).attr("text-anchor", "end");
    });
    return g;
  }
  function setState(g, rows) {
    const ys = rows.length > 1 ? [5, 25] : [14];
    [0, 1].forEach((i) => {
      const r = rows[i];
      g.select(`.s-l${i}`).attr("y", ys[i] ?? 0).text(r ? r.l : "");
      g.select(`.s-r${i}`).attr("y", ys[i] ?? 0).text(r ? r.r : "");
    });
  }
  /* Flash a card's outline. On a state card, row = index of the number that just changed: it lights up briefly. */
  function flash(g, row) {
    g.select(".c-flash").interrupt().style("opacity", 1).transition().duration(700).style("opacity", 0);
    if (row != null) g.select(`.s-r${row}`).interrupt().style("fill", "var(--accent)").transition().delay(500).duration(0).style("fill", null);
  }

  /* Tint one number of a state card for a moment, e.g. gold when the watermark removed rows. */
  function mark(g, row, color) {
    g.select(`.s-r${row}`).interrupt().style("fill", color).transition().delay(600).duration(0).style("fill", null);
  }

  function sqlHtml(sql) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc(sql).replace(/\b(SELECT|FROM|WHERE|GROUP BY|AS|EMIT|PERIODIC|ON UPDATE|AFTER WINDOW CLOSE|WITH DELAY|LATEST JOIN|JOIN|ON|AND)\b/g, '<span class="kw">$1</span>');
  }

  function start(ep) {
    const svg = d3.select("#stage");
    let mode = ep.modes[0], speed = 1, paused = false, now = 0, last = null;
    const playBtn = document.querySelector("#play");

    const lg = document.querySelector("#legend");
    if (lg && ep.legend) {
      lg.innerHTML = ep.legend.map((it) => `<span class="lg-item"><i class="lg-sw${it.cls ? " " + it.cls : ""}"${it.key ? ` style="background:${keyColor(it.key)}"` : ""}></i>${it.label}</span>`).join("")
        + (ep.legendNote ? `<span class="lg-note">${ep.legendNote}</span>` : "");
    }
    function load(m) {
      mode = m;
      document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === m.id ? "true" : "false"));
      document.querySelector("#sql").innerHTML = sqlHtml(m.sql);
      document.querySelector("#note").innerHTML = m.note;
      svg.selectAll("*").interrupt().remove();
      now = 0;
      ep.init(svg, m);
    }
    const modes = document.querySelector("#modes");
    ep.modes.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.id = m.id; b.textContent = m.label;
      b.addEventListener("click", () => load(m));
      modes.appendChild(b);
    });
    const setPaused = (p) => { paused = p; playBtn.textContent = p ? "Play" : "Pause"; };
    playBtn.addEventListener("click", () => setPaused(!paused));
    document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
      speed = +b.dataset.s;
      document.querySelectorAll("#speed button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    }));
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.target.closest("button,input,select")) { e.preventDefault(); setPaused(!paused); }
    });
    document.addEventListener("visibilitychange", () => { last = null; });

    load(ep.modes[0]);
    const sc = document.querySelector(".stage-scroll");
    if (sc) sc.scrollLeft = sc.scrollWidth * (ep.focus ?? 0.5) - sc.clientWidth / 2;   // on narrow screens, start centered on the operator
    d3.timer((t) => {
      if (last == null) { last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000) * speed;
      last = t;
      if (paused) return;
      now += dt;
      ep.tick(dt, now);
    });
    return { get now() { return now; } };
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  return { CARD, card, fill, flash, mark, stateCard, setState, hms, keyColor, start, rng };
})();
