#!/usr/bin/env python3
"""
One-off codemod: replace hard-coded design values in the CMP dashboard's CSS
(and inline React style objects) with the tokens in src/styles/tokens.css.

    python3 scripts/tokenize-css.py --dry-run   # report only
    python3 scripts/tokenize-css.py             # rewrite files

Mapping rules (value-preserving where possible):
- Gold at any alpha  -> var(--color-accent) / rgb(var(--c-accent) / a)
- Semantic hues      -> their token channel, alpha kept
- White/black + alpha -> rgb(var(--c-white|--c-black) / a)
- Opaque greys, by property:
    text (color, fill…)     -> text-primary / secondary / muted / inverse
    backgrounds             -> bg-sunken / base / raised (within ±6)
- Anything else (brand, chart and illustration colours) is left untouched.
- font-size -> nearest step of the type scale; below 13px -> 13px.
- padding / margin / gap -> nearest 4px step (hairlines and negatives kept).
- border-radius -> radius scale; box-shadow -> shadow tokens.
Analytics (src/Pages/Analytics) has its own --sa-* token system and is
excluded.
"""
import os, re, sys, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry-run" in sys.argv
EXCLUDE_DIRS = ("src/Pages/Analytics", "src/styles")
stats = collections.Counter()
left = collections.Counter()

# ── colour helpers ────────────────────────────────────────────────────────────
COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)')
def parse(c):
    c = c.strip().lower()
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4): h = ''.join(x * 2 for x in h)
        if len(h) not in (6, 8): return None
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(a, 3))
    if 'var(' in c: return None
    nums = re.findall(r'-?[\d.]+%?', c)
    if len(nums) < 3: return None
    def ch(v): return float(v[:-1]) * 2.55 if v.endswith('%') else float(v)
    r, g, b = (ch(n) for n in nums[:3])
    a = 1.0
    if len(nums) > 3:
        a = float(nums[3][:-1]) / 100 if nums[3].endswith('%') else float(nums[3])
    return (round(r), round(g), round(b), round(a, 3))

def alpha_str(a):
    s = ('%.3f' % a).rstrip('0').rstrip('.')
    return s if s else '0'

HUES = {  # token -> rgb ; tolerance per channel
    'accent': (192, 159, 83), 'accent-strong': (212, 182, 116),
    'success': (74, 222, 128), 'warning': (249, 191, 64),
    'danger': (248, 113, 113), 'danger-text': (252, 165, 165),
    'info': (96, 165, 250), 'info-text': (147, 197, 253),
}
TEXT = {'text-primary': 240, 'text-secondary': 197, 'text-muted': 173, 'text-inverse': 27}
BG = {'bg-sunken': 34, 'bg-base': 55, 'bg-raised': 63}
TEXT_PROPS = {'color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color'}

def is_grey(r, g, b, tol=6): return max(r, g, b) - min(r, g, b) <= tol

def map_color(rgba, prop):
    r, g, b, a = rgba
    # Faint tints (alpha < 0.35) can snap further without a visible change.
    hue_tol = 45 if a < 0.35 else 24
    best = min(HUES.items(), key=lambda kv: max(abs(r - kv[1][0]), abs(g - kv[1][1]), abs(b - kv[1][2])))
    for name, (hr, hg, hb) in [best]:
        if max(abs(r - hr), abs(g - hg), abs(b - hb)) <= hue_tol:
            stats['colour:' + name] += 1
            return f'var(--color-{name})' if a >= 0.999 else f'rgb(var(--c-{name}) / {alpha_str(a)})'
    if a < 0.999 and is_grey(r, g, b, 4) and (r >= 245 or r <= 10):
        stats['colour:tint'] += 1
        return f"rgb(var(--c-{'white' if r >= 245 else 'black'}) / {alpha_str(a)})"
    if a >= 0.85 and is_grey(r, g, b):
        L = (r + g + b) / 3
        if prop in TEXT_PROPS:
            if L >= 225: tok = 'text-primary'
            elif L >= 185: tok = 'text-secondary'
            elif L >= 100: tok = 'text-muted'      # darker greys fail AA as text — lift to muted
            elif L <= 60: tok = 'text-inverse'
            else: return None
            stats['colour:' + tok] += 1
            return f'var(--color-{tok})' if a >= 0.999 else f'rgb(var(--c-{tok}) / {alpha_str(a)})'
        if prop.startswith('background') or prop == '--gradient':
            name, v = min(BG.items(), key=lambda kv: abs(kv[1] - L))
            if abs(v - L) <= 8:
                stats['colour:' + name] += 1
                return f'var(--color-{name})' if a >= 0.999 else f'rgb(var(--c-{name}) / {alpha_str(a)})'
    return None

def replace_colors(value, prop):
    def sub(m):
        rgba = parse(m.group(0))
        if not rgba: return m.group(0)
        out = map_color(rgba, prop)
        if out is None:
            left['colour ' + m.group(0).lower().replace(' ', '')] += 1
            return m.group(0)
        return out
    return COLOR_RE.sub(sub, value)

# ── size helpers ──────────────────────────────────────────────────────────────
TYPE = [(13, 'xs'), (14, 'sm'), (16, 'base'), (18, 'lg'), (20, 'xl'), (24, '2xl'), (28, '3xl'), (32, '4xl'), (40, '5xl')]
SPACE = [(4, '1'), (8, '2'), (12, '3'), (16, '4'), (20, '5'), (24, '6'), (28, '7'), (32, '8'), (40, '10'), (48, '12'), (56, '14'), (64, '16'), (80, '20'), (96, '24')]
RADIUS = [(2, 'xs'), (4, 'sm'), (8, 'md'), (12, 'lg'), (16, 'xl'), (24, '2xl')]
def to_px(tok):
    m = re.fullmatch(r'(-?\d*\.?\d+)(px|rem)?', tok)
    if not m: return None
    n = float(m.group(1))
    return n * 16 if m.group(2) == 'rem' else (n if m.group(2) or n == 0 else None)

def nearest(scale, px, ties='up'):
    return min(scale, key=lambda s: (abs(s[0] - px), -s[0] if ties == 'up' else s[0]))

def map_font_size(value):
    px = to_px(value.strip())
    if px is None or px <= 0: return None
    if px > 48: return None
    size, name = nearest(TYPE, max(px, 13))
    stats['font-size'] += 1
    if px < 13: stats['font-size raised to 13px'] += 1
    return f'var(--text-{name})'

def map_spacing(value):
    parts = value.split()
    out, changed = [], False
    for p in parts:
        px = to_px(p)
        if px is None or px < 3 or px > 104:
            out.append(p); continue
        _, name = nearest(SPACE, px, ties='down')   # never grow: avoids new wrapping
        out.append(f'var(--space-{name})'); changed = True; stats['spacing'] += 1
    return ' '.join(out) if changed else None

def map_radius(value):
    if '/' in value: return None
    out, changed = [], False
    for p in value.split():
        px = to_px(p)
        if px is None or px == 0: out.append(p); continue
        if px >= 28: out.append('var(--radius-full)')
        else:
            _, name = nearest(RADIUS, px); out.append(f'var(--radius-{name})')
        changed = True; stats['radius'] += 1
    return ' '.join(out) if changed else None

def split_top(value):
    parts, depth, cur = [], 0, ''
    for ch in value:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    return [p.strip() for p in parts]

def map_shadow(value):
    if value.strip() in ('none', 'inherit', 'initial') or 'var(--shadow' in value: return None
    out, changed = [], False
    for sh in split_top(value):
        # Lengths in order (offset-x, offset-y, blur, spread); unitless 0 counts.
        tokens = re.sub(COLOR_RE, '', sh).replace('inset', '').split()
        nums = [to_px(t) if to_px(t) is not None else (0.0 if t == '0' else None) for t in tokens]
        nums = [n for n in nums if n is not None] + [0] * 4
        inset = sh.startswith('inset')
        x, y, blur, spread = nums[:4]
        if inset:
            rgba = next((parse(c) for c in COLOR_RE.findall(sh)), None)
            if rgba and rgba[0] >= 245 and rgba[3] <= 0.1 and blur == 0 and abs(y) <= 1:
                out.append('var(--shadow-inset)'); changed = True; stats['shadow'] += 1; continue
            out.append(replace_colors(sh, 'box-shadow')); continue
        if blur == 0 and x == 0 and y == 0:          # ring: keep geometry, tokenise colour
            out.append(replace_colors(sh, 'box-shadow')); continue
        tok = 'sm' if blur <= 6 else 'md' if blur <= 28 else 'lg' if blur <= 44 else 'overlay'
        out.append(f'var(--shadow-{tok})'); changed = True; stats['shadow'] += 1
    new = ', '.join(out)
    return new if (changed or new != value.strip()) else None

# ── declaration rewriting ─────────────────────────────────────────────────────
SPACING_PROPS = re.compile(r'^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$')
def rewrite_decl(prop, value):
    p = prop.lower()
    if '!important' in value:
        core, imp = value.replace('!important', '').rstrip(), ' !important'
    else:
        core, imp = value, ''
    new = None
    if p == 'font-size': new = map_font_size(core)
    elif SPACING_PROPS.match(p): new = map_spacing(core)
    elif p == 'border-radius' or re.match(r'^border-(top|bottom)-(left|right)-radius$', p): new = map_radius(core)
    elif p == 'box-shadow': new = map_shadow(core)
    if new is None and COLOR_RE.search(core) and p != 'box-shadow':
        ctx = '--gradient' if ('gradient(' in core and p.startswith('background')) else p
        c = replace_colors(core, ctx)
        if c != core: new = c
    return (new + imp) if new is not None else None

DECL_RE = re.compile(r'(?<=[{;\s])(--[\w-]+|-?[a-z][a-z-]*)(\s*:\s*)([^;{}]+?)(\s*)(?=;|})')
def rewrite_css(src):
    out, i = [], 0
    # only touch text inside rule blocks (depth ≥ 1, not @media prelude)
    for m in DECL_RE.finditer(src):
        prop, sep, val, ws = m.groups()
        if prop.startswith('--'): continue          # leave legacy custom-property definitions
        new = rewrite_decl(prop, val)
        if new is None or new == val: continue
        out.append(src[i:m.start(3)]); out.append(new); i = m.end(3)
    out.append(src[i:])
    return ''.join(out)

# ── inline React style objects ────────────────────────────────────────────────
STYLE_RE = re.compile(r'style=\{\{(.*?)\}\}', re.S)
JS_PROP_RE = re.compile(r'(\b[a-zA-Z]+)(\s*:\s*)(["\'])([^"\']*)(\3)|(\bfontSize)(\s*:\s*)(\d+(?:\.\d+)?)(?=\s*[,}\n])')
def kebab(n): return re.sub(r'([A-Z])', lambda m: '-' + m.group(1).lower(), n)
def rewrite_js(src):
    def style_block(m):
        body = m.group(1)
        def prop_sub(pm):
            if pm.group(6):  # fontSize: 12 (number)
                new = map_font_size(pm.group(8) + 'px')
                return pm.group(0) if new is None else f'{pm.group(6)}{pm.group(7)}"{new}"'
            name, sep, q, val = pm.group(1), pm.group(2), pm.group(3), pm.group(4)
            p = kebab(name)
            if p in ('font-size',) or SPACING_PROPS.match(p) or p in ('border-radius', 'box-shadow') or COLOR_RE.search(val):
                if SPACING_PROPS.match(p): return pm.group(0)   # inline spacing is layout-specific — left alone
                new = rewrite_decl(p, val)
                if new is not None: return f'{name}{sep}{q}{new}{q}'
            return pm.group(0)
        return 'style={{' + JS_PROP_RE.sub(prop_sub, body) + '}}'
    return STYLE_RE.sub(style_block, src)

changed_files = []
for dp, _, fns in os.walk(os.path.join(ROOT, 'src')):
    rel_dir = os.path.relpath(dp, ROOT)
    if rel_dir.startswith(EXCLUDE_DIRS): continue
    for f in fns:
        path = os.path.join(dp, f)
        if f.endswith('.css'): fn = rewrite_css
        elif f.endswith('.js') and 'style={{' in open(path, errors='ignore').read(): fn = rewrite_js
        else: continue
        src = open(path, encoding='utf-8').read()
        new = fn(src)
        if new != src:
            changed_files.append(os.path.relpath(path, ROOT))
            if not DRY: open(path, 'w', encoding='utf-8').write(new)

print(json.dumps({
    'files_changed': len(changed_files),
    'replacements': dict(stats.most_common()),
    'colours_left_untouched': sum(left.values()),
    'distinct_colours_left': len(left),
    'top_untouched': left.most_common(15),
}, indent=1))
