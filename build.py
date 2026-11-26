#!/usr/bin/env python3
"""Build self-contained pages into dist/: the Stream Lab episodes (for engineers)
and the Stream Stories (the same ideas as a small factory, for everyone else).

Usage: python3 build.py [--links links.json] [--fragment]
--fragment writes body-only pages to build/artifact/ (for hosts that add their own <html> skeleton).
links.json (optional) maps a page name (file name without .html) -> URL for the navigation;
by default pages link to each other as relative files (GitHub Pages friendly).
"""
import json, sys, pathlib, html
ROOT = pathlib.Path(__file__).resolve().parent

def main():
    links = {}
    if "--links" in sys.argv:
        links = json.loads((ROOT / sys.argv[sys.argv.index("--links") + 1]).read_text())
    eps = json.loads((ROOT / "episodes.json").read_text())
    shell, css, core = ((ROOT / "src/lab-shell.html").read_text(), (ROOT / "src/lab.css").read_text(), (ROOT / "src/lab.js").read_text())
    fragment = "--fragment" in sys.argv
    out = ROOT / ("build/artifact" if fragment else "dist"); out.mkdir(parents=True, exist_ok=True)
    for ep in eps:
        js_path = ROOT / "episodes" / ep["slug"] / "episode.js"
        if not js_path.exists():
            continue
        # each page only links to the neighbouring episodes
        def nav(o, arrow_left):
            if o is None or not (ROOT / "episodes" / o["slug"] / "episode.js").exists():
                return "<span></span>"
            href = links.get(o["slug"], f"{o['slug']}.html")
            name = f'{o["num"]:02d} {html.escape(o["name"])}'
            return f'<a href="{href}">{"← " + name if arrow_left else name + " →"}</a>'
        i = eps.index(ep)
        items = [nav(eps[i - 1] if i > 0 else None, True), nav(eps[i + 1] if i + 1 < len(eps) else None, False)]
        page = (shell.replace("{{TITLE}}", ep["title"]).replace("{{DESCRIPTION}}", ep["description"])
                .replace("{{EP_NUM}}", f'{ep["num"]:02d}').replace("{{H1}}", ep["h1"])
                .replace("{{SERIES}}", "".join(items)).replace("{{CORE_CSS}}", css)
                .replace("{{CORE_JS}}", core).replace("{{EP_JS}}", js_path.read_text()))
        if not fragment:
            page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                    + page.replace("<div class=\"page\">", "</head>\n<body>\n<div class=\"page\">", 1)
                    + "</body>\n</html>\n")
        (out / f"{ep['slug']}.html").write_text(page)
        print("built", out / f"{ep['slug']}.html")
    stories(links, eps, fragment, out)

def stories(links, eps, fragment, out):
    """Stream Stories live in stories/ and are written as story-<slug>.html."""
    src = ROOT / "stories"
    items = json.loads((src / "stories.json").read_text())
    shell, css, core = ((src / "src/story-shell.html").read_text(), (src / "src/story.css").read_text(),
                        (src / "src/story.js").read_text() + "\n" + (src / "src/factory.js").read_text())
    ready = [s for s in items if (src / "episodes" / s["slug"] / "episode.js").exists()]
    for i, st in enumerate(ready):
        def nav(o, arrow_left):
            href = links.get(f"story-{o['slug']}", f"story-{o['slug']}.html")
            name = f'{o["num"]:02d} {html.escape(o["name"])}'
            return f'<a href="{href}">{"← " + name if arrow_left else name + " →"}</a>'
        nav_items = []
        if i > 0:
            nav_items.append(nav(ready[i - 1], True))
        eng = next((e for e in eps if e["slug"] == st.get("engineer")), None)
        if eng:
            nav_items.append(f'<a href="{links.get(eng["slug"], eng["slug"] + ".html")}">For engineers: {html.escape(eng["name"])}</a>')
        if i + 1 < len(ready):
            nav_items.append(nav(ready[i + 1], False))
        page = (shell.replace("{{TITLE}}", st["title"]).replace("{{DESCRIPTION}}", st["description"])
                .replace("{{EP_NUM}}", f'{st["num"]:02d}').replace("{{H1}}", st["h1"]).replace("{{SUB}}", st["sub"])
                .replace("{{SERIES}}", "".join(nav_items)).replace("{{CORE_CSS}}", css)
                .replace("{{CORE_JS}}", core).replace("{{EP_JS}}", (src / "episodes" / st["slug"] / "episode.js").read_text()))
        if not fragment:
            page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                    + page.replace("<div class=\"page\">", "</head>\n<body>\n<div class=\"page\">", 1)
                    + "</body>\n</html>\n")
        (out / f"story-{st['slug']}.html").write_text(page)
        print("built", out / f"story-{st['slug']}.html")

if __name__ == "__main__":
    main()
