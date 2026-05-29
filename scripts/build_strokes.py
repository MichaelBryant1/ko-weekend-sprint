#!/usr/bin/env python3
# Hand-authored Hangul stroke data -> content/hangul_strokes.json
# Base 24 jamo authored explicitly; tense = doubled base; compound vowels = composed
# from component vowels (per spec). Normalized 0-100 viewBox. Also merges strokes
# into hangul payloads in seed_items.json and emits hangul_blocks.json.
import json, os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")

# stroke = {"pts": [[x,y],...]}  OR  {"circle":[cx,cy,r]}
BASE = {
  # --- basic consonants ---
  "ㄱ": [{"pts": [[22,26],[78,26],[78,80]]}],
  "ㄴ": [{"pts": [[30,22],[30,80],[80,80]]}],
  "ㄷ": [{"pts": [[22,26],[80,26]]}, {"pts": [[22,26],[22,80],[80,80]]}],
  "ㄹ": [{"pts": [[24,24],[70,24],[70,48]]}, {"pts": [[24,48],[70,48]]}, {"pts": [[24,48],[24,78],[76,78]]}],
  "ㅁ": [{"pts": [[28,24],[28,80]]}, {"pts": [[28,24],[74,24],[74,80]]}, {"pts": [[28,80],[74,80]]}],
  "ㅂ": [{"pts": [[28,20],[28,80]]}, {"pts": [[72,20],[72,80]]}, {"pts": [[28,52],[72,52]]}, {"pts": [[28,80],[72,80]]}],
  "ㅅ": [{"pts": [[50,24],[26,80]]}, {"pts": [[50,42],[76,80]]}],
  "ㅇ": [{"circle": [50,52,28]}],
  "ㅈ": [{"pts": [[26,30],[74,30]]}, {"pts": [[50,30],[28,80]]}, {"pts": [[52,46],[76,80]]}],
  "ㅊ": [{"pts": [[42,12],[58,12]]}, {"pts": [[26,32],[74,32]]}, {"pts": [[50,32],[28,80]]}, {"pts": [[52,48],[76,80]]}],
  "ㅋ": [{"pts": [[22,26],[78,26],[78,80]]}, {"pts": [[22,52],[60,52]]}],
  "ㅌ": [{"pts": [[22,24],[80,24]]}, {"pts": [[22,52],[78,52]]}, {"pts": [[22,24],[22,80],[80,80]]}],
  "ㅍ": [{"pts": [[20,30],[80,30]]}, {"pts": [[32,30],[32,76]]}, {"pts": [[68,30],[68,76]]}, {"pts": [[20,76],[80,76]]}],
  "ㅎ": [{"pts": [[40,12],[60,12]]}, {"pts": [[26,32],[74,32]]}, {"circle": [50,62,18]}],
  # --- basic vowels ---
  "ㅏ": [{"pts": [[50,12],[50,88]]}, {"pts": [[50,50],[76,50]]}],
  "ㅑ": [{"pts": [[50,12],[50,88]]}, {"pts": [[50,38],[76,38]]}, {"pts": [[50,62],[76,62]]}],
  "ㅓ": [{"pts": [[26,50],[50,50]]}, {"pts": [[50,12],[50,88]]}],
  "ㅕ": [{"pts": [[26,38],[50,38]]}, {"pts": [[26,62],[50,62]]}, {"pts": [[50,12],[50,88]]}],
  "ㅗ": [{"pts": [[50,22],[50,54]]}, {"pts": [[16,54],[84,54]]}],
  "ㅛ": [{"pts": [[38,22],[38,52]]}, {"pts": [[62,22],[62,52]]}, {"pts": [[16,52],[84,52]]}],
  "ㅜ": [{"pts": [[16,48],[84,48]]}, {"pts": [[50,48],[50,80]]}],
  "ㅠ": [{"pts": [[16,46],[84,46]]}, {"pts": [[38,46],[38,78]]}, {"pts": [[62,46],[62,78]]}],
  "ㅡ": [{"pts": [[15,52],[85,52]]}],
  "ㅣ": [{"pts": [[52,12],[52,88]]}],
}

def xform(stroke, sx, sy, tx, ty):
    if "circle" in stroke:
        cx, cy, r = stroke["circle"]
        return {"circle": [cx*sx+tx, cy*sy+ty, r*min(sx,sy)]}
    return {"pts": [[round(x*sx+tx,1), round(y*sy+ty,1)] for x, y in stroke["pts"]]}

# tense consonants = two scaled copies side by side
TENSE = {"ㄲ":"ㄱ","ㄸ":"ㄷ","ㅃ":"ㅂ","ㅆ":"ㅅ","ㅉ":"ㅈ"}
def build_tense(base_sym):
    out = []
    for off in (2, 52):
        for s in BASE[base_sym]:
            out.append(xform(s, 0.46, 1.0, off, 0))
    return out

# compound vowels = component vowels placed by layout
# layout helpers
def L_right_i(v):  # vowel + ㅣ on the far right (ae/e/yae/ye)
    out = [xform(s, 1, 1, -12, 0) for s in BASE[v]]
    out += [xform(s, 1, 1, 30, 0) for s in BASE["ㅣ"]]
    return out
def L_h_plus_i(h):  # horizontal vowel (ㅗ/ㅜ/ㅡ) + ㅣ right (oe/wi/ui)
    out = [xform(s, 0.62, 1, -6, 0) for s in BASE[h]]
    out += [xform(s, 1, 1, 30, 0) for s in BASE["ㅣ"]]
    return out
def L_h_plus_v(h, v):  # horizontal (top/bottom) + vertical-with-tick on right (wa/wo)
    out = [xform(s, 0.58, 0.6, -4, 18) for s in BASE[h]]
    out += [xform(s, 0.78, 1, 26, 0) for s in BASE[v]]
    return out
def L_h_plus_v_i(h, v):  # h + vertical + ㅣ (wae/we)
    out = [xform(s, 0.5, 0.6, -6, 18) for s in BASE[h]]
    out += [xform(s, 0.62, 1, 14, 0) for s in BASE[v]]
    out += [xform(s, 1, 1, 36, 0) for s in BASE["ㅣ"]]
    return out

COMPOUND = {
  "ㅐ": ("ㅏ+ㅣ", lambda: L_right_i("ㅏ")),
  "ㅒ": ("ㅑ+ㅣ", lambda: L_right_i("ㅑ")),
  "ㅔ": ("ㅓ+ㅣ", lambda: L_right_i("ㅓ")),
  "ㅖ": ("ㅕ+ㅣ", lambda: L_right_i("ㅕ")),
  "ㅘ": ("ㅗ+ㅏ", lambda: L_h_plus_v("ㅗ","ㅏ")),
  "ㅙ": ("ㅗ+ㅐ", lambda: L_h_plus_v_i("ㅗ","ㅏ")),
  "ㅚ": ("ㅗ+ㅣ", lambda: L_h_plus_i("ㅗ")),
  "ㅝ": ("ㅜ+ㅓ", lambda: L_h_plus_v("ㅜ","ㅓ")),
  "ㅞ": ("ㅜ+ㅔ", lambda: L_h_plus_v_i("ㅜ","ㅓ")),
  "ㅟ": ("ㅜ+ㅣ", lambda: L_h_plus_i("ㅜ")),
  "ㅢ": ("ㅡ+ㅣ", lambda: L_h_plus_i("ㅡ")),
}

def stroke_to_d(s):
    if "circle" in s:
        cx, cy, r = s["circle"]
        return f"M {cx-r:.1f} {cy:.1f} a {r:.1f} {r:.1f} 0 1 1 {2*r:.1f} 0 a {r:.1f} {r:.1f} 0 1 1 {-2*r:.1f} 0"
    pts = s["pts"]
    d = f"M {pts[0][0]} {pts[0][1]}"
    for p in pts[1:]:
        d += f" L {p[0]} {p[1]}"
    return d

def direction_note(s):
    if "circle" in s:
        return "Draw the circle in one smooth motion."
    pts = s["pts"]
    dx = pts[-1][0]-pts[0][0]; dy = pts[-1][1]-pts[0][1]
    segs = len(pts)-1
    if segs > 1:
        return "Follow the corners in order, in one stroke."
    if abs(dx) >= abs(dy)*1.5:
        return "Left to right."
    if abs(dy) >= abs(dx)*1.5:
        return "Top to bottom."
    return "Diagonal, top to bottom."

def assemble(strokes):
    return [{"order": i+1, "d": stroke_to_d(s), "dir": direction_note(s)} for i, s in enumerate(strokes)]

# Build full table keyed by symbol
strokes_by_symbol = {}
for sym, st in BASE.items():
    strokes_by_symbol[sym] = assemble(st)
for sym, base in TENSE.items():
    strokes_by_symbol[sym] = assemble(build_tense(base))
for sym, (label, fn) in COMPOUND.items():
    strokes_by_symbol[sym] = assemble(fn())

json.dump(strokes_by_symbol, open(os.path.join(C, "hangul_strokes.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# Merge strokes into seed_items.json hangul payloads
seed = json.load(open(os.path.join(C, "seed_items.json"), encoding="utf-8"))
merged = 0
for it in seed:
    if it["item_type"] == "hangul":
        sym = it["payload"]["symbol"]
        if sym in strokes_by_symbol:
            it["payload"]["strokes"] = strokes_by_symbol[sym]
            it["payload"]["stroke_count"] = len(strokes_by_symbol[sym])
            merged += 1
json.dump(seed, open(os.path.join(C, "seed_items.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# Syllable blocks (composition examples)
blocks = {
  "가": {"components": ["ㄱ","ㅏ"], "layout": "left_right", "note": "Vertical vowel ㅏ goes to the RIGHT of ㄱ."},
  "나": {"components": ["ㄴ","ㅏ"], "layout": "left_right", "note": "ㅏ to the right of ㄴ."},
  "고": {"components": ["ㄱ","ㅗ"], "layout": "top_bottom", "note": "Horizontal vowel ㅗ goes BELOW ㄱ."},
  "구": {"components": ["ㄱ","ㅜ"], "layout": "top_bottom", "note": "Horizontal vowel ㅜ goes below ㄱ."},
  "다": {"components": ["ㄷ","ㅏ"], "layout": "left_right", "note": "ㅏ to the right of ㄷ."},
  "도": {"components": ["ㄷ","ㅗ"], "layout": "top_bottom", "note": "ㅗ below ㄷ."},
  "한": {"components": ["ㅎ","ㅏ","ㄴ"], "layout": "left_right_bottom", "note": "ㅎ + ㅏ on top, final ㄴ (batchim) at the BOTTOM."},
  "국": {"components": ["ㄱ","ㅜ","ㄱ"], "layout": "top_bottom_bottom", "note": "ㄱ + ㅜ, then final ㄱ at the bottom."},
  "말": {"components": ["ㅁ","ㅏ","ㄹ"], "layout": "left_right_bottom", "note": "ㅁ + ㅏ on top, final ㄹ at the bottom."},
  "사": {"components": ["ㅅ","ㅏ"], "layout": "left_right", "note": "ㅏ to the right of ㅅ."},
  "람": {"components": ["ㄹ","ㅏ","ㅁ"], "layout": "left_right_bottom", "note": "ㄹ + ㅏ on top, final ㅁ at the bottom."},
}
json.dump(blocks, open(os.path.join(C, "hangul_blocks.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print(f"strokes authored for {len(strokes_by_symbol)} jamo")
print(f"merged strokes into {merged} hangul payloads")
print(f"syllable blocks: {len(blocks)}")
# sanity: any reviewable jamo missing strokes?
missing = [it['payload']['symbol'] for it in seed if it['item_type']=='hangul'
           and it['payload']['group']!='batchim_overview' and 'strokes' not in it['payload']]
print("reviewable jamo missing strokes:", missing or "none")
