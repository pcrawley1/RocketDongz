#!/usr/bin/env python3
"""Cache-bust: stamp every local .js/.css reference with ?v=<stamp> so a deploy never mixes old and new files.
Run before committing:  python3 stamp.py"""
import re, time, pathlib
root = pathlib.Path(__file__).parent
stamp = time.strftime("%Y%m%d%H%M%S")
pat = re.compile(r'''((?:\./|js/)?[\w-]+\.(?:js|css))(\?v=\w+)?(["'])''')
files = [root / "index.html", *sorted((root / "js").glob("*.js"))]
for f in files:
    s = f.read_text()
    if f.suffix == ".js":
        # only rewrite import specifiers like from "./x.js"
        new = re.sub(r'''(from\s+["']\./[\w-]+\.js)(\?v=\w+)?(["'])''', lambda m: f"{m.group(1)}?v={stamp}{m.group(3)}", s)
    else:
        new = re.sub(r'''((?:href|src)=")((?:js/)?[\w-]+\.(?:js|css))(\?v=\w+)?(")''', lambda m: f"{m.group(1)}{m.group(2)}?v={stamp}{m.group(4)}", s)
    if new != s:
        f.write_text(new)
print("stamped", stamp)

# ---- Short-link pages: full copies of the app with their own link-preview card.
# (No redirects: iMessage runs JS when building previews, so a redirect would show the main page's card.)
B = "https://pcrawley1.github.io/RocketDongz"
PAGES = {
    "spuds": dict(title="The Studs and Spuds Gazette", og="🥔 The Studs and Spuds Gazette",
                  desc="This week's recap, awards, roasts and next week's lines. Click if you dare.",
                  img="og-potato.png", ln="Studs and Spuds FFL", tab="newsletter"),
    "spuds/rankings": dict(title="Power Rankings vs Zev's Picks", og="🥔 Power Rankings vs Zev's Preseason Picks",
                  desc="Zev ranked himself #1. Click to see how that's going.",
                  img="og-potato.png", ln="Studs and Spuds FFL", tab="power"),
    "chugs": dict(title="Rocket Dongs Chugs", og="🍻 Rocket Dongs Chugs",
                  desc="Last place chugs. On camera. No exceptions. Upload your shame here.",
                  img="og.png", ln="Rocket Dongs", tab="chugs"),
}
import json, html as _h
base_html = (root / "index.html").read_text()
for path, c in PAGES.items():
    depth = path.count("/") + 1
    meta = f"""  <!--page-meta-->
  <base href="{'../' * depth}">
  <title>{_h.escape(c['title'])}</title>
  <meta property="og:title" content="{_h.escape(c['og'])}">
  <meta property="og:description" content="{_h.escape(c['desc'])}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{B}/{path}/">
  <meta property="og:image" content="{B}/{c['img']}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>window.RD_DEFAULTS = {json.dumps({'ln': c['ln'], 'tab': c['tab']})};</script>
  <!--/page-meta-->"""
    page = re.sub(r"  <!--page-meta-->.*?<!--/page-meta-->", lambda m: meta, base_html, flags=re.S)
    out = root / path / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)
print("generated", ", ".join(PAGES))
