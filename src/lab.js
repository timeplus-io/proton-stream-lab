/* Proton Stream Lab, simple runtime (needs d3 v7).
   A continuous simulation: an episode supplies modes, init(mode) and tick(dt, now).
   The loop runs until the viewer presses Pause. */
const Lab = (() => {
  const CARD = { w: 118, h: 74 };
  const BASE = 12 * 3600; // processing clock starts at 12:00:00
  const keyColor = (k) => `var(--k-${String(k).toLowerCase()})`;
  const hms = (t) => {
    const s = BASE + t;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
  };

  /* A data card: every field of the event is printed inside it.
     Color = key. Rounded = main/left stream, square corners = right stream of a join. */
  function card(layer, ev) {
    const { w, h } = CARD, x0 = -w / 2, y0 = -h / 2;
    const g = layer.append("g").attr("class", "card");
    const rx = ev.side === "R" ? 3 : 12;
    g.append("rect").attr("class", "body").attr("x", x0).attr("y", y0).attr("width", w).attr("height", h).attr("rx", rx).style("fill", keyColor(ev.key));
    g.append("rect").attr("class", "c-flash").attr("x", x0 - 3).attr("y", y0 - 3).attr("width", w + 6).attr("height", h + 6).attr("rx", rx + 2);
    g.append("text").attr("class", "c-id").attr("x", x0 + 11).attr("y", y0 + 19);
    g.append("rect").attr("class", "c-chip").attr("y", y0 + 7).attr("height", 17).attr("rx", 8.5);
    g.append("text").attr("class", "c-key").attr("y", y0 + 19.5).attr("text-anchor", "middle");
    g.append("text").attr("class", "c-val").attr("x", x0 + 11).attr("y", 8);
    const ic = g.append("g").attr("class", "c-icon").attr("transform", `translate(${x0 + 16},${h / 2 - 13})`);
    ic.append("circle").attr("r", 4.6);
    ic.append("path").attr("d", "M0,-2.6 V0 H2.2");
    g.append("text").attr("class", "c-time").attr("x", x0 + 26).attr("y", h / 2 - 9.5);
    const bd = g.append("g").attr("class", "c-badge").attr("transform", `translate(${w / 2 - 5},${y0 + 5})`).style("opacity", 0);
    bd.append("circle").attr("r", 10);
    bd.append("path");
    fill(g, ev);
    return g;
  }
  function fill(g, ev) {
    const label = ev.keyLabel || ev.key;
    const cw = label.length * 6.3 + 14;
    g.select(".c-id").text(`#${ev.id}`);
    g.select(".c-chip").attr("x", CARD.w / 2 - 9 - cw).attr("width", cw);
    g.select(".c-key").attr("x", CARD.w / 2 - 9 - cw / 2).text(label);
    g.select(".c-val").text(ev.valText);
    g.select(".c-time").text(hms(ev.et).slice(0, 8));
    g.select("title").remove();
    g.append("title").text(`event #${ev.id}, ${label}, ${ev.valText}, event time ${hms(ev.et).slice(0, 8)}`);
  }
  function flash(g) {
    g.select(".c-flash").interrupt().style("opacity", 1).transition().duration(700).style("opacity", 0);
  }
  /* Small verdict badge on the card corner: pass (check) or fail (cross). */
  function badge(g, ok, hold) {
    const b = g.select(".c-badge").attr("class", "c-badge " + (ok ? "ok" : "no"));
    b.select("path").attr("d", ok ? "M-4.2,0.3 L-1.2,3.3 L4.4,-3" : "M-3.4,-3.4 L3.4,3.4 M3.4,-3.4 L-3.4,3.4");
    b.interrupt().style("opacity", 1);
    if (!hold) b.transition().delay(650).duration(300).style("opacity", 0);
  }

  function sqlHtml(sql) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc(sql).replace(/\b(SELECT|FROM|WHERE|GROUP BY|AS|EMIT|JOIN|ON|AND|tumble|hop)\b/g, '<span class="kw">$1</span>');
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

  return { CARD, card, fill, flash, badge, hms, keyColor, start, rng };
})();
