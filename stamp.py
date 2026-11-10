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
