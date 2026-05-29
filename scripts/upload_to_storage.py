#!/usr/bin/env python3
# Upload app files + audio to the public Supabase Storage bucket 'ko-sprint'.
# Uses the anon key + the temporary insert/update policy (locked down afterward).
import os, sys, mimetypes, urllib.request, urllib.error, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPABASE_URL = "https://ylceljdbapxeynyqphcr.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inls"
        "Y2VsamRiYXB4ZXlueXFwaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Nzc5MjIsImV4cCI6"
        "MjA4ODQ1MzkyMn0.r1JoBx3ZeckpLhWPkLp4z5O2uDNf5zlYv_-8l-4AQJE")
BUCKET = "ko-sprint"
WORKERS = 8

CT = {".mp3": "audio/mpeg", ".html": "text/html", ".css": "text/css",
      ".js": "application/javascript", ".json": "application/json",
      ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon"}

done = skipped = failed = 0
lock = threading.Lock()
fails = []

def exists(path):
    url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False

def upload(local, path, skip_if_exists):
    global done, skipped, failed
    if skip_if_exists and exists(path):
        with lock: skipped += 1
        return
    with open(local, "rb") as f:
        data = f.read()
    ct = CT.get(os.path.splitext(local)[1].lower(), "application/octet-stream")
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, method="POST", headers={
                "apikey": ANON, "Authorization": f"Bearer {ANON}",
                "Content-Type": ct, "x-upsert": "true", "Cache-Control": "max-age=3600"})
            with urllib.request.urlopen(req, timeout=60) as r:
                r.read()
            with lock:
                done += 1
                n = done + skipped
                if n % 100 == 0: print(f"  {n} files...", flush=True)
            return
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                continue
            with lock: failed += 1; fails.append((path, f"HTTP {e.code}: {e.read()[:120]}"))
            return
        except Exception as e:
            if attempt < 3: continue
            with lock: failed += 1; fails.append((path, str(e)))
            return

jobs = []
# audio (skip existing — immutable once generated)
audio_root = os.path.join(ROOT, "audio")
for dirpath, _, files in os.walk(audio_root):
    for fn in files:
        if fn.startswith("_") or not fn.endswith(".mp3"):
            continue
        local = os.path.join(dirpath, fn)
        rel = os.path.relpath(local, ROOT).replace(os.sep, "/")  # audio/...
        jobs.append((local, rel, True))
# app files (always upsert so iterating is easy)
for fn in os.listdir(os.path.join(ROOT, "app")):
    local = os.path.join(ROOT, "app", fn)
    if os.path.isfile(local):
        jobs.append((local, fn, False))

print(f"Uploading {len(jobs)} objects to bucket '{BUCKET}' ({WORKERS} workers)...", flush=True)
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    list(ex.map(lambda j: upload(*j), jobs))

print(f"\nDONE  uploaded={done}  skipped={skipped}  failed={failed}", flush=True)
for p, e in fails[:20]:
    print("  FAIL", p, e)
sys.exit(1 if failed else 0)
