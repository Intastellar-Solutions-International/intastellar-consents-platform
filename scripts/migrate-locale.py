#!/usr/bin/env python3
"""
One-off codemod: route hard-coded formatting locales through
src/Functions/format.js (CMP dashboard; Analytics excluded).

1. X.toLocaleDateString("<locale>")  and the "3 Nov 2026" variant
   X.toLocaleDateString("<locale>", { day: "numeric", month: "short", year: "numeric" })
   -> formatDate(X)            (one date format everywhere)
2. Any remaining "de-DE" / "en-GB" / "da-DK" passed to toLocale*String or
   Intl.NumberFormat / Intl.DateTimeFormat -> appLocale()
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry-run" in sys.argv
LOC = r'"(?:de-DE|en-GB|da-DK)"'
RECV = r'(new Date\((?:[^()]|\([^()]*\))*\)|[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\[\]]*\]|\((?:[^()]|\([^()]*\))*\))*)'
MEDIUM = r'(?:\s*,\s*\{\s*day:\s*"numeric",\s*month:\s*"short",\s*year:\s*"numeric"\s*\})?'
DATE_RE = re.compile(RECV + r'\.toLocaleDateString\(\s*' + LOC + MEDIUM + r'\s*\)')
LOCALE_ARG_RE = re.compile(r'(\.toLocale(?:Date|Time)?String\(\s*|Intl\.(?:NumberFormat|DateTimeFormat)\(\s*)' + LOC)
totals = {"formatDate": 0, "appLocale": 0, "files": 0}
for dp, _, fns in os.walk(os.path.join(ROOT, "src")):
    rel = os.path.relpath(dp, ROOT)
    if rel.startswith("src/Pages/Analytics") or rel.startswith("src/Pages/Styleguide"): continue
    for f in fns:
        if not f.endswith(".js") or f in ("format.js", "userLocale.js"): continue
        path = os.path.join(dp, f)
        src = open(path, encoding="utf-8").read()
        new, n1 = DATE_RE.subn(lambda m: f"formatDate({m.group(1)})", src)
        new, n2 = LOCALE_ARG_RE.subn(lambda m: m.group(1) + "appLocale()", new)
        if not (n1 or n2): continue
        names = [n for n, used in (("appLocale", n2), ("formatDate", n1)) if used]
        imp_path = os.path.relpath(os.path.join(ROOT, "src/Functions/format.js"), dp)
        if not imp_path.startswith("."): imp_path = "./" + imp_path
        lines = new.split("\n")
        idx = max((i for i, l in enumerate(lines[:120]) if l.startswith("import ") and l.rstrip().endswith(";")), default=-1)
        lines.insert(idx + 1, "import { " + ", ".join(names) + ' } from "' + imp_path + '";')
        new = "\n".join(lines)
        totals["formatDate"] += n1; totals["appLocale"] += n2; totals["files"] += 1
        if not DRY: open(path, "w", encoding="utf-8").write(new)
print(totals)
