#!/usr/bin/env python3
# Validate + merge authored content into seed_items.json and audio_manifest.json.
import json, os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")

VOICE_YOONI   = "n2fbxG88jqAoaVPUy3IG"  # female, letters + words + examples
VOICE_MINJOON = "8cOkLISXzLWeGEsu0cZC"  # male, sentences

def load(p): return json.load(open(os.path.join(C, p), encoding="utf-8"))

# Cyrillic look-alikes that occasionally slip into generated romaja -> Latin.
_HOMO = {"а":"a","е":"e","о":"o","с":"c","р":"p","у":"y","х":"x","г":"g","к":"k",
         "в":"v","н":"n","м":"m","т":"t","і":"i","ѕ":"s","ј":"j","ԁ":"d","ё":"e"}
def norm_romaja(s):
    if not s: return s
    s = "".join(_HOMO.get(ch, ch) for ch in s)
    s = s.lower()
    s = re.sub(r"\s+", " ", s).strip()
    return s

issues = []

# ---- words: merge base + parts ----
base = load("words_base.json")
base_by_rank = {w["rank"]: w for w in base}
parts = {}
for i in range(1, 7):
    for e in load(f"words_part_{i}.json"):
        parts[e["rank"]] = e

seed = []
manifest = []
seen_paths = set()

def add_audio(text, voice, path):
    if path in seen_paths:
        return
    seen_paths.add(path)
    manifest.append({"text": text, "voice": voice, "path": path})

for rank in range(1, 301):
    w = base_by_rank.get(rank)
    p = parts.get(rank)
    if not w:
        issues.append(f"word rank {rank}: missing base entry"); continue
    if not p:
        issues.append(f"word rank {rank} ({w['ko']}): missing authored sentences"); continue
    if p["ko"] != w["ko"]:
        issues.append(f"word rank {rank}: ko mismatch base='{w['ko']}' part='{p['ko']}'")
    sents = p.get("sentences", [])
    if len(sents) != 3:
        issues.append(f"word rank {rank} ({w['ko']}): {len(sents)} sentences (expected 3)")
    z = f"{rank:04d}"
    headword_first = w["ko"][0]
    hit = False
    out_sents = []
    for j, s in enumerate(sents[:3], 1):
        for f in ("ko", "en", "romaja"):
            if not s.get(f, "").strip():
                issues.append(f"word rank {rank} ({w['ko']}) sentence {j}: empty {f}")
        if headword_first in s.get("ko", ""):
            hit = True
        spath = f"audio/sentences/{z}_{j}.mp3"
        out_sents.append({"ko": s.get("ko", ""), "en": s.get("en", ""),
                          "romaja": norm_romaja(s.get("romaja", "")), "audio_path": spath})
        add_audio(s.get("ko", ""), VOICE_MINJOON, spath)
    if not hit:
        issues.append(f"word rank {rank} ({w['ko']}): headword's first syllable not found in any sentence — REVIEW")
    wpath = f"audio/words/{z}.mp3"
    add_audio(w["ko"], VOICE_YOONI, wpath)
    seed.append({
        "id": f"word_{z}",
        "item_type": "word",
        "sort_order": rank,
        "payload": {
            "rank": rank, "ko": w["ko"], "en": w["en"], "pos": w["pos"],
            "romaja": norm_romaja(w["romaja"]), "audio_path": wpath, "sentences": out_sents,
        },
    })

# ---- hangul ----
hangul = load("hangul.json")
for it in hangul["items"]:
    hid = it["id"]
    name_path = f"audio/hangul/{hid}.mp3"
    add_audio(it["name_ko"], VOICE_YOONI, name_path)
    exs = []
    for j, ex in enumerate(it.get("examples", [])[:3], 1):
        epath = f"audio/hangul_ex/{hid}_{j}.mp3"
        exs.append({"ko": ex["ko"], "en": ex["en"],
                    "romaja": norm_romaja(ex.get("romaja", "")), "audio_path": epath})
        add_audio(ex["ko"], VOICE_YOONI, epath)
    seed.append({
        "id": hid,
        "item_type": "hangul",
        "sort_order": it["order"],
        "payload": {
            "group": it["group"], "symbol": it["symbol"], "name_ko": it["name_ko"],
            "romanization": it["romanization"], "sound_note": it["sound_note"],
            "position_note": it.get("position_note", ""), "audio_path": name_path,
            "examples": exs,
        },
    })

json.dump(seed, open(os.path.join(C, "seed_items.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(manifest, open(os.path.join(C, "audio_manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

words = sum(1 for s in seed if s["item_type"] == "word")
hg = sum(1 for s in seed if s["item_type"] == "hangul")
chars = sum(len(m["text"]) for m in manifest)
print(f"seed items: {len(seed)}  (words={words}, hangul={hg})")
print(f"audio manifest jobs: {len(manifest)}  (~{chars} chars to synthesize)")
print(f"validation issues: {len(issues)}")
for x in issues:
    print("  -", x)
