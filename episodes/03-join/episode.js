/* Episode 3: streaming join (enrichment, bidirectional, range, aligned checkpoint). */
(() => {
  const KEYS = ["A", "B", "C"];
  const TL = { x0: 20, nowX: 300, y: 80, pps: 50 };
  const TR = { x0: 20, nowX: 300, y: 270, pps: 50 };
  const J = { x: 340, y: 24, w: 540, h: 326 };
  const ROWX = 404, STEP = 28;
  const rowY = (side, k) => (side === "L" ? 94 : 246) + KEYS.indexOf(k) * 40;
  const PROBE = { x: 640, y: 206 };
  const INFO = { x: 900, y: 24, w: 280, h: 170 };
  const CK = { x: 900, y: 208, w: 280, h: 142 };
  const OUT = { y: 370, h: 240 };

  let A, L, tapes, out, S;

  const l = (id, key, et, at, extra = {}) => ({ id, key, et, at, side: "L", ...extra });
  const r = (id, key, et, at, extra = {}) => ({ id, key, et, at, side: "R", ...extra });
  const tl = (et) => Math.round((et * 0.7 + 0.6) * 10) / 10;
  const PAIRS = [
    l(1, "A", 1, tl(1)), r(1, "A", 2, tl(2)), l(2, "B", 3, tl(3)), r(2, "B", 4, tl(4)), l(3, "A", 5, tl(5)), r(3, "C", 6, tl(6)),
    l(4, "C", 7, tl(7)), r(4, "A", 9, tl(9)), l(5, "B", 10, tl(10)), r(5, "B", 11, tl(11)), l(6, "A", 12, tl(12)), r(6, "C", 13, tl(13)),
    l(7, "C", 14, tl(14)), r(7, "A", 15, tl(15)),
  ];
  const price = (v) => ({ val: v, valText: `$${v}` });
  const ENRICH = [
    r(1, "A", null, 0.3, { ...price(5), backfill: true }), r(2, "B", null, 0.7, { ...price(8), backfill: true }),
    l(1, "A", 2, 2.0), l(2, "B", 3, 2.8), r(3, "A", null, 3.5, price(6)), l(3, "A", 4, 4.2), l(4, "C", 5, 4.9),
    r(4, "C", null, 5.5, price(3)), l(5, "C", 6, 6.1), l(6, "B", 7, 6.8), r(5, "B", null, 7.4, price(9)), l(7, "B", 8, 8.1),
  ];

  const chapters = [
    {
      id: "enrich", title: "Enrichment join", short: "Only the right side is stored", sub: "append-only stream × versioned_kv",
      cfg: { kind: "enrich", left: "orders", right: "products" }, script: ENRICH,
      sql: `SELECT o.id, o.product, p.price\nFROM orders AS o\nJOIN products AS p ON o.product = p.product;\n-- products is a versioned_kv / mutable stream`,
      body: [
        "The most common streaming join looks up extra columns for each event. Only the <b>right</b> side is kept in a hash table: one row per key, always the latest version. The left side is never stored; each left event probes the table once and leaves.",
        "Before any left event is joined, the right side backfills its history so early orders find their product.",
      ],
      watch: [
        "Square #3 replaces #1 for product A. Order #3 joins with the new price; order #1's output is not changed.",
        "Order #4 (product C) arrives before any C product exists. An INNER join emits nothing for it; a LEFT join would emit it with empty columns.",
        "State is bounded by the number of products, not by the number of orders.",
      ],
      refs: [
        "<code>src/Processors/Transforms/Streaming/JoinTransform.cpp</code>; <code>EXPLAIN PIPELINE</code> shows the join flavour in brackets.",
        "Join strictness and kind: <code>src/Interpreters/Streaming/HashJoin/joinKind.h</code> (Latest, All, Asof, Range, Anti).",
        "A static enrichment uses <code>table(products)</code>: the right side is loaded once, before the left starts.",
      ],
    },
    {
      id: "bidirectional", title: "Bidirectional join", short: "Both sides stored, forever", sub: "append-only × append-only",
      cfg: { kind: "bi", left: "impressions", right: "clicks" }, script: PAIRS,
      sql: `SELECT i.campaign, i._tp_time, c._tp_time\nFROM impressions AS i\nJOIN clicks AS c ON i.campaign = c.campaign;`,
      body: [
        "When both inputs are append-only streams, an event on either side can produce output. So each side keeps a hash table, and every arrival does two things: insert itself into its own table, then probe the other table and emit one row per match.",
        "Nothing tells the join when an old row can be thrown away. Both tables grow for as long as the query runs.",
      ],
      watch: ["Each new block draws lines to every match on the other side.", "The rows-in-state counter only goes up. In production this is how join memory explodes; <code>join_max_buffered_bytes</code> is the guard rail."],
      refs: ["Bidirectional hash join: <code>src/Interpreters/Streaming/HashJoin/HashJoin.cpp</code>.", "Field lesson from the KT: turning one side append-only with <code>enforce_append_only=1</code> made a mutable × mutable join an enrichment join and fixed its memory."],
    },
    {
      id: "range", title: "Range join bounds the state", short: "date_diff_within(4s)", sub: "Same events, matches limited to 4 seconds apart",
      cfg: { kind: "bi", range: 4, left: "impressions", right: "clicks" }, script: PAIRS,
      sql: `SELECT i.campaign, i._tp_time, c._tp_time\nFROM impressions AS i\nJOIN clicks AS c\n  ON i.campaign = c.campaign\n AND date_diff_within(4s);`,
      body: [
        "Adding a time bound changes everything. Two rows match only if their event times are at most 4 seconds apart, so a row older than the slowest side's progress minus 4 seconds can never match again.",
        "The join tracks how far each input has got in event time, takes the minimum, and evicts rows that fell behind that point minus the range. State now stays small.",
      ],
      watch: [
        "Impression #5 (10s) and click #2 (4s) share campaign B but are 6 seconds apart: dashed line, no match. In the previous chapter they matched.",
        "Rows fade out of both tables once they are older than join watermark − 4s.",
        "The join watermark is the <i>minimum</i> of the two sides. If one input stalls, eviction stalls with it.",
      ],
      refs: ["<code>JoinTransformWithAlignment</code> pulls both inputs and keeps their event times aligned for range joins.", "<code>RangeAsofJoinContext</code> holds the range bounds (<code>src/Interpreters/Streaming/HashJoin/</code>)."],
    },
    {
      id: "aligned", title: "Aligned checkpoint barriers", short: "Two inputs, one consistent snapshot", sub: "Range join inside a materialized view",
      cfg: { kind: "bi", range: 4, left: "impressions", right: "clicks", barriers: { L: 4.4, R: 5.9 } }, script: PAIRS,
      sql: `CREATE MATERIALIZED VIEW campaign_clicks_mv\nINTO campaign_clicks AS\nSELECT i.campaign, i._tp_time, c._tp_time\nFROM impressions AS i\nJOIN clicks AS c\n  ON i.campaign = c.campaign\n AND date_diff_within(4s);`,
      body: [
        "A join has two inputs, and the checkpoint barrier enters at both sources. The barriers rarely reach the join at the same moment.",
        "When the first barrier arrives, the join stops reading that input and keeps reading the other one until its barrier arrives too. Only then does it save both hash tables. This is <b>aligned</b> checkpointing: the saved state matches exactly the two source offsets.",
      ],
      watch: [
        "The left barrier arrives first. Impression #4 has to wait in the paused input.",
        "Click #3 is still processed, because it was ahead of the right barrier.",
        "Both tables are saved at once, then the paused input drains.",
      ],
      refs: ["Multi-input operators wait for the barrier on every input before writing state (KT notes, <code>src/Checkpoint/</code>).", "<code>JoinTransform_Checkpoint.cpp</code> and <code>JoinTransformWithAlignment_Checkpoint.cpp</code> serialize both tables."],
    },
  ];

  /* ---------- stage ---------- */
  function setup(ch) {
    const cfg = ch.cfg;
    const svg = d3.select("#stage").attr("viewBox", "0 0 1200 620");
    svg.selectAll("*").remove();
    SL.defs(svg);
    L = { bg: svg.append("g"), lines: svg.append("g"), tape: svg.append("g"), blocks: svg.append("g"), fx: svg.append("g"), out: svg.append("g"), top: svg.append("g") };
    tapes = {
      L: new SL.Tape(L.bg, L.tape, { ...TL, label: `Left · ${cfg.left}` }),
      R: new SL.Tape(L.bg, L.tape, { ...TR, label: `Right · ${cfg.right}` }),
    };
    S = { cfg, ch, clock: 0, tables: { L: { A: [], B: [], C: [] }, R: { A: [], B: [], C: [] } }, max: { L: null, R: null }, jw: null, held: [], blocked: false, barriersIn: {}, emitted: 0 };
    S.clockTxt = L.bg.append("text").attr("class", "clock-big").attr("x", TL.nowX).attr("y", 20).attr("text-anchor", "end").text("00:00.0");

    SL.flowArrow(L.bg, TL.nowX + 4, TL.y, J.x - 4, TL.y);
    SL.flowArrow(L.bg, TR.nowX + 4, TR.y, J.x - 4, TR.y);
    SL.flowArrow(L.bg, J.x + J.w / 2, J.y + J.h + 2, J.x + J.w / 2, OUT.y - 4);

    // join box
    L.bg.append("rect").attr("class", "box").attr("x", J.x).attr("y", J.y).attr("width", J.w).attr("height", J.h).attr("rx", 10);
    L.bg.append("text").attr("class", "box-title").attr("x", J.x + 14).attr("y", J.y + 22).text("Join transform");
    const flavour = cfg.kind === "enrich" ? "enrichment · right side kept" : cfg.range ? `bidirectional range · ${cfg.range}s` : "bidirectional · both sides kept";
    L.bg.append("text").attr("class", "box-sub").attr("x", J.x + J.w - 14).attr("y", J.y + 22).attr("text-anchor", "end").text(flavour);
    ["L", "R"].forEach((side) => {
      const y0 = rowY(side, "A") - 30;
      L.bg.append("rect").attr("class", "box-soft").attr("x", J.x + 10).attr("y", y0 + 6).attr("width", J.w - 20).attr("height", 124).attr("rx", 8);
      L.bg.append("text").attr("class", "lbl").attr("x", J.x + 20).attr("y", y0 + 2).text(side === "L" ? `Left hash table · ${cfg.left}` : `Right hash table · ${cfg.right}`);
      KEYS.forEach((k) => {
        L.bg.append("circle").attr("cx", J.x + 26).attr("cy", rowY(side, k)).attr("r", 5).style("fill", SL.keyColor(k));
        L.bg.append("text").attr("class", "box-sub").attr("x", J.x + 36).attr("y", rowY(side, k) + 4).text(k);
      });
    });
    if (cfg.kind === "enrich") {
      L.bg.append("rect").attr("x", J.x + 10).attr("y", rowY("L", "A") - 24).attr("width", J.w - 20).attr("height", 124).attr("rx", 8).style("fill", "var(--panel)").style("opacity", 0.75);
      L.bg.append("text").attr("class", "muted-txt").attr("x", J.x + J.w / 2).attr("y", rowY("L", "B") + 4).attr("text-anchor", "middle").text("not stored: left events probe the right table and leave");
    }

    // info panel
    SL.boxWithTitle(L.bg, { x: INFO.x, y: INFO.y, w: INFO.w, h: INFO.h, title: "Join state", sub: cfg.range ? "event-time progress decides eviction" : "" });
    const row = (i, label, cls = "") => {
      L.bg.append("text").attr("class", "lbl").attr("x", INFO.x + 14).attr("y", INFO.y + 60 + i * 22).text(label);
      return L.bg.append("text").attr("class", "val " + cls).attr("x", INFO.x + INFO.w - 14).attr("y", INFO.y + 60 + i * 22).attr("text-anchor", "end").text("—");
    };
    S.vRowsL = row(0, "left rows in state"); S.vRowsR = row(1, "right rows in state");
    if (cfg.range) { S.vMax = row(2, "max event time L / R"); S.vJw = row(3, "join watermark (min)", "wm"); S.vCut = row(4, "evict rows older than"); }
    else if (cfg.kind === "bi") { L.bg.append("text").attr("class", "danger-txt").attr("x", INFO.x + 14).attr("y", INFO.y + 120).text("never freed"); }
    else { L.bg.append("text").attr("class", "muted-txt").attr("x", INFO.x + 14).attr("y", INFO.y + 120).text("one row per product key"); }
    updateCounts();

    // checkpoint store / note
    S.ck = SL.boxWithTitle(L.bg, { x: CK.x, y: CK.y, w: CK.w, h: CK.h, title: cfg.barriers ? "Checkpoint storage" : "Inputs", sub: cfg.barriers ? "nothing saved yet" : "" });
    S.ckSub = S.ck.select(".box-sub");
    S.ckLayer = L.bg.append("g");
    if (!cfg.barriers) {
      S.ckLayer.append("text").attr("class", "muted-txt").attr("x", CK.x + 14).attr("y", CK.y + 50).text(cfg.kind === "enrich" ? "Left: append-only, triggers output" : "Left: append-only, triggers output");
      S.ckLayer.append("text").attr("class", "muted-txt").attr("x", CK.x + 14).attr("y", CK.y + 72).text(cfg.kind === "enrich" ? "Right: versioned, updates the table" : "Right: append-only, triggers output");
      S.ckLayer.append("text").attr("class", "muted-txt").attr("x", CK.x + 14).attr("y", CK.y + 100).text(cfg.kind === "enrich" ? "Right updates never emit rows." : "Either side can emit rows.");
    }

    // output
    L.bg.append("rect").attr("class", "box").attr("x", 20).attr("y", OUT.y).attr("width", 1160).attr("height", OUT.h).attr("rx", 10);
    L.bg.append("text").attr("class", "box-title").attr("x", 34).attr("y", OUT.y + 22).text("Joined rows");
    L.bg.append("text").attr("class", "box-sub").attr("x", 1166).attr("y", OUT.y + 22).attr("text-anchor", "end").text("newest last · ● left event ■ right event");
    out = new SL.OutGrid(L.out, { x: 34, y: OUT.y + 54, cols: 4, rows: 5, cw: 287, rh: 36, w: 274 });

    const evs = ch.script.map((e) => ({ ...e, uid: e.side + e.id }));
    evs.forEach((e) => tapes[e.side].add(e, 0));
    S.evs = evs;
    const q = evs.map((e) => ({ type: "ev", ev: e, at: e.at }));
    if (cfg.kind === "enrich") q.push({ type: "note", at: 1.2, text: "Right side finished backfill (historical data end). Left side starts." });
    if (cfg.barriers) { q.push({ type: "barrier", side: "L", at: cfg.barriers.L }); q.push({ type: "barrier", side: "R", at: cfg.barriers.R }); }
    q.sort((a, b) => a.at - b.at);
    return q;
  }

  function updateCounts() {
    const n = (side) => KEYS.reduce((s, k) => s + S.tables[side][k].length, 0);
    S.vRowsL.text(S.cfg.kind === "enrich" ? "0 (not kept)" : String(n("L")));
    S.vRowsR.text(String(n("R")));
    if (S.cfg.range) {
      S.vMax.text(`${S.max.L ?? "—"}s / ${S.max.R ?? "—"}s`.replace("—s", "—"));
      S.vJw.text(S.jw == null ? "—" : `${S.jw}s`);
      S.vCut.text(S.jw == null ? "—" : `${S.jw - S.cfg.range}s`);
    }
  }

  const slot = (side, k, j) => ({ x: ROWX + 30 + j * STEP, y: rowY(side, k) });

  const setClock = (t) => { S.clock = t; S.clockTxt.text(SL.fmt(t)); };
  async function handle(it) {
    await SL.clockTo({ get clock() { return S.clock; }, setClock: (t) => { setClock(t); A.setClock(t); } }, [tapes.L, tapes.R], it.at);
    if (it.type === "note") { A.log(it.text); return SL.sleep(200); }
    if (it.type === "barrier") return onBarrier(it.side);
    if (it.type === "ev") {
      const e = it.ev;
      const g = tapes[e.side].take(e, L.blocks);
      if (e.side === "L" && S.blocked) {
        S.held.push({ ev: e, g });
        A.log(`Impression #${e.id} waits: the left input is paused at the barrier`);
        return SL.W(SL.move(g, TL.nowX - 16 - (S.held.length - 1) * 28, TL.y + 52, 380));
      }
      return process(e, g);
    }
  }

  async function process(e, g) {
    if (S.cfg.kind === "enrich") return e.side === "R" ? enrichRight(e, g) : enrichLeft(e, g);
    return biArrive(e, g);
  }

  /* enrichment */
  async function enrichRight(e, g) {
    const row = S.tables.R[e.key];
    const old = row[0];
    await SL.W(SL.move(g, slot("R", e.key, 1).x, slot("R", e.key, 0).y, 420));
    if (old) {
      A.log(`${e.backfill ? "Backfill: " : ""}product ${e.key} updated: #${e.id} (${e.valText}) replaces #${old.ev.id} (${old.ev.valText})`);
      old.g.classed("dropped", true);
      await SL.fadeOut(old.g, 380, -10);
    } else {
      A.log(`${e.backfill ? "Backfill: " : ""}product ${e.key} = #${e.id} (${e.valText}) added to the right table`);
    }
    S.tables.R[e.key] = [{ ev: e, g }];
    await SL.W(SL.move(g, slot("R", e.key, 0).x, slot("R", e.key, 0).y, 260));
    updateCounts();
  }
  async function enrichLeft(e, g) {
    await SL.W(SL.move(g, PROBE.x, PROBE.y, 440));
    const m = S.tables.R[e.key][0];
    if (!m) {
      A.log(`Order #${e.id} (product ${e.key}): no product ${e.key} in the right table → INNER JOIN emits nothing`);
      g.classed("dropped", true);
      await SL.sleep(300);
      return SL.fadeOut(g, 400, 20);
    }
    const ln = probeLine(PROBE, SL.pos(m.g), true);
    await SL.sleep(260);
    A.log(`Order #${e.id} probes product ${e.key} → matches #${m.ev.id} (${m.ev.valText})`);
    SL.fadeOut(g, 300);
    await emit(e, m.ev, PROBE, `${e.key}  ${m.ev.valText}`);
    ln.remove();
  }

  /* bidirectional */
  async function biArrive(e, g) {
    const side = e.side, other = side === "L" ? "R" : "L";
    const row = S.tables[side][e.key];
    const p = slot(side, e.key, row.length);
    await SL.W(SL.move(g, p.x, p.y, 440));
    row.push({ ev: e, g });
    S.max[side] = S.max[side] == null ? e.et : Math.max(S.max[side], e.et);
    updateCounts();
    const cands = S.tables[other][e.key];
    const name = side === "L" ? "Impression" : "Click";
    if (!cands.length) A.log(`${name} #${e.id} (${e.key}, ${e.et}s) stored; nothing to match on the ${other === "L" ? "left" : "right"} yet`);
    const lines = [];
    const matches = [];
    cands.forEach((c) => {
      const ok = !S.cfg.range || Math.abs(c.ev.et - e.et) <= S.cfg.range;
      lines.push(probeLine(p, SL.pos(c.g), ok));
      if (ok) matches.push(c);
    });
    if (cands.length) {
      await SL.sleep(300);
      const miss = cands.filter((c) => !matches.includes(c));
      A.log(`${name} #${e.id} (${e.key}, ${e.et}s) stored, probes ${other === "L" ? "left" : "right"}: ${matches.length} match${matches.length === 1 ? "" : "es"}` +
        (miss.length ? `; ${miss.map((c) => `#${c.ev.id} is ${Math.abs(c.ev.et - e.et)}s away`).join(", ")}, out of range` : ""));
      for (const c of matches) {
        const lev = side === "L" ? e : c.ev, rev = side === "L" ? c.ev : e;
        await emit(lev, rev, { x: (p.x + SL.pos(c.g).x) / 2, y: (p.y + SL.pos(c.g).y) / 2 }, `${e.key}  Δ ${Math.abs(lev.et - rev.et)}s`);
      }
      lines.forEach((x) => x.remove());
    }
    if (S.cfg.range) await evict();
  }

  async function evict() {
    if (S.max.L == null || S.max.R == null) return;
    const jw = Math.min(S.max.L, S.max.R);
    if (S.jw === jw) return;
    S.jw = jw;
    const cut = jw - S.cfg.range;
    const gone = [];
    const ps = [];
    ["L", "R"].forEach((side) => KEYS.forEach((k) => {
      const keep = [];
      S.tables[side][k].forEach((x) => (x.ev.et < cut ? gone.push({ side, x }) : keep.push(x)));
      S.tables[side][k] = keep;
      keep.forEach((x, j) => { const p = slot(side, k, j); ps.push(SL.move(x.g, p.x, p.y, 320)); });
    }));
    updateCounts();
    if (gone.length) {
      A.log(`Join watermark ${jw}s (min of both sides) → evict rows older than ${cut}s: ${gone.map(({ side, x }) => (side === "L" ? "●" : "■") + x.ev.id).join(", ")}`);
      gone.forEach(({ x }) => { x.g.classed("dropped", true); ps.push(SL.fadeOut(x.g, 420, 10)); });
    }
    await SL.all(ps);
  }

  function probeLine(a, b, ok) {
    return L.lines.append("line").attr("x1", a.x).attr("y1", a.y).attr("x2", b.x).attr("y2", b.y)
      .style("stroke", ok ? "var(--fg)" : "var(--late)").style("stroke-width", ok ? 1.6 : 1.2).style("stroke-dasharray", ok ? null : "4 3").style("opacity", 0.7);
  }

  async function emit(lev, rev, from, extra) {
    S.emitted++;
    await out.add({ key: lev.key, marks: [{ key: lev.key, side: "L" }, { key: rev.key, side: "R" }], text: `#${lev.id} ⋈ #${rev.id}  ${extra}`, time: `@${SL.fmt(S.clock)}` }, from);
  }

  /* aligned barriers */
  async function onBarrier(side) {
    const tape = side === "L" ? TL : TR;
    const b = SL.barrier(L.top, 1);
    SL.place(b, tape.nowX, tape.y); b.style("opacity", 0); SL.tr(b, 200).style("opacity", 1);
    A.log(`Checkpoint 1: barrier injected at the ${side === "L" ? "impressions" : "clicks"} source`);
    await SL.W(SL.move(b, J.x + 4, tape.y, 420));
    S.barriersIn[side] = b;
    if (side === "L" && !S.barriersIn.R) {
      S.blocked = true;
      S.pauseTxt = L.top.append("text").attr("class", "danger-txt").attr("x", TL.x0).attr("y", TL.y + 84).text("left input paused: waiting for the right barrier");
      A.log("Left barrier reached the join first: pause the left input until the right barrier arrives");
      return;
    }
    // both arrived: snapshot
    A.log("Both barriers are at the join: save both hash tables");
    const items = [];
    ["L", "R"].forEach((sd) => KEYS.forEach((k) => S.tables[sd][k].forEach((x) => items.push({ sd, x }))));
    const ps = items.map(({ sd, x }, i) => {
      const g = SL.block(S.ckLayer, x.ev, { tag: false });
      const p = SL.pos(x.g); SL.place(g, p.x, p.y);
      const col = sd === "L" ? 0 : 1, idx = items.filter((y, j) => j < i && y.sd === sd).length;
      return SL.move(g, CK.x + 28 + idx * 22, CK.y + 70 + col * 40, 600, { scale: 0.7 });
    });
    S.ckLayer.append("text").attr("class", "lbl").attr("x", CK.x + 14).attr("y", CK.y + 56).text("left table");
    S.ckLayer.append("text").attr("class", "lbl").attr("x", CK.x + 14).attr("y", CK.y + 96).text("right table");
    await SL.all(ps);
    S.ckSub.text("ckpt 1 ✓ both tables + both offsets").style("fill", "var(--ok)");
    Object.values(S.barriersIn).forEach((x) => SL.fadeOut(x, 300));
    if (S.pauseTxt) SL.fadeOut(S.pauseTxt, 300);
    S.blocked = false;
    const held = S.held; S.held = [];
    if (held.length) A.log(`Left input resumes: ${held.map((x) => "#" + x.ev.id).join(", ")}`);
    for (const h of held) await process(h.ev, h.g);
  }

  const ep = { id: "ep3", chapters, setup, handle };
  window.addEventListener("DOMContentLoaded", () => { A = SL.app(ep); });
})();
