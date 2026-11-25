#!/usr/bin/env python3
"""Build self-contained episode pages into dist/.

Usage: python3 build.py [--links links.json] [--fragment]
--fragment writes body-only pages to build/artifact/ (for hosts that add their own <html> skeleton).
links.json (optional) maps episode slug -> URL for the series navigation;
by default pages link to each other as relative files (GitHub Pages friendly).
"""
import json, sys, pathlib, html
ROOT = pathlib.Path(__file__).resolve().parent
LATER = ["Changelog", "Backfill", "S3 storage", "Hybrid hash table", "Materialized views", "Checkpoint", "Cluster"]

def main():
    links = {}
    if "--links" in sys.argv:
        links = json.loads((ROOT / sys.argv[sys.argv.index("--links") + 1]).read_text())
    eps = json.loads((ROOT / "episodes.json").read_text())
    shells = {
        "classic": ((ROOT / "src/shell.html").read_text(), (ROOT / "src/core.css").read_text(), (ROOT / "src/core.js").read_text()),
        "lab": ((ROOT / "src/lab-shell.html").read_text(), (ROOT / "src/lab.css").read_text(), (ROOT / "src/lab.js").read_text()),
    }
    fragment = "--fragment" in sys.argv
    out = ROOT / ("build/artifact" if fragment else "dist"); out.mkdir(parents=True, exist_ok=True)
    for ep in eps:
        js_path = ROOT / "episodes" / ep["slug"] / "episode.js"
        if not js_path.exists():
            continue
        kind = ep.get("shell", "classic")
        shell, css, core = shells[kind]
        items = []
        for o in eps:
            built = (ROOT / "episodes" / o["slug"] / "episode.js").exists()
            href = links.get(o["slug"], f"{o['slug']}.html")
            cls = "here" if o is ep else ""
            label = f'<span class="num">{o["num"]:02d}</span>{html.escape(o["name"])}'
            if o is ep:
                items.append(f'<li class="here"><span>{label}</span></li>')
            elif built:
                items.append(f'<li><a href="{href}">{label}</a></li>')
            else:
                items.append(f'<li class="later"><span>{label}</span></li>')
        n = len(eps)
        if kind == "lab":
            # lab pages only link to the neighbouring episodes
            def nav(o, arrow_left):
                if o is None or not (ROOT / "episodes" / o["slug"] / "episode.js").exists():
                    return "<span></span>"
                href = links.get(o["slug"], f"{o['slug']}.html")
                name = f'{o["num"]:02d} {html.escape(o["name"])}'
                return f'<a href="{href}">{"← " + name if arrow_left else name + " →"}</a>'
            i = eps.index(ep)
            items = [nav(eps[i - 1] if i > 0 else None, True), nav(eps[i + 1] if i + 1 < len(eps) else None, False)]
        else:
          for i, name in enumerate(LATER):
            items.append(f'<li class="later"><span><span class="num">{n + i + 1:02d}</span>{name}</span></li>')
        page = (shell.replace("{{TITLE}}", ep["title"]).replace("{{DESCRIPTION}}", ep["description"])
                .replace("{{EP_NUM}}", f'{ep["num"]:02d}' if kind == "lab" else str(ep["num"])).replace("{{H1}}", ep["h1"]).replace("{{LEDE}}", ep["lede"])
                .replace("{{SERIES}}", "".join(items)).replace("{{CORE_CSS}}", css)
                .replace("{{CORE_JS}}", core).replace("{{EP_JS}}", js_path.read_text()))
        if not fragment:
            page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                    + page.replace("<div class=\"page\">", "</head>\n<body>\n<div class=\"page\">", 1)
                    + "</body>\n</html>\n")
        (out / f"{ep['slug']}.html").write_text(page)
        print("built", out / f"{ep['slug']}.html")

if __name__ == "__main__":
    main()
