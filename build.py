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
    shell = (ROOT / "src/shell.html").read_text()
    css = (ROOT / "src/core.css").read_text()
    core = (ROOT / "src/core.js").read_text()
    fragment = "--fragment" in sys.argv
    out = ROOT / ("build/artifact" if fragment else "dist"); out.mkdir(parents=True, exist_ok=True)
    for ep in eps:
        js_path = ROOT / "episodes" / ep["slug"] / "episode.js"
        if not js_path.exists():
            continue
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
        for i, name in enumerate(LATER):
            items.append(f'<li class="later"><span><span class="num">{n + i + 1:02d}</span>{name}</span></li>')
        page = (shell.replace("{{TITLE}}", ep["title"]).replace("{{DESCRIPTION}}", ep["description"])
                .replace("{{EP_NUM}}", str(ep["num"])).replace("{{H1}}", ep["h1"]).replace("{{LEDE}}", ep["lede"])
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
