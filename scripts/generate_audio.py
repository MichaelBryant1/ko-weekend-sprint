#!/usr/bin/env python3
# Generate all Korean MP3s from content/audio_manifest.json via ElevenLabs.
# Resumable: skips files that already exist (>1KB). Threaded (Creator tier safe).
import json, os, sys, time, threading
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = "eleven_multilingual_v2"
OUTFMT = "mp3_44100_128"
WORKERS = 4

def api_key():
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not k:
        envp = os.path.join(ROOT, ".env")
        if os.path.exists(envp):
            for line in open(envp, encoding="utf-8"):
                if line.startswith("ELEVENLABS_API_KEY="):
                    k = line.split("=", 1)[1].strip()
    if not k:
        sys.exit("ERROR: ELEVENLABS_API_KEY not found in env or .env")
    return k

KEY = api_key()
manifest = json.load(open(os.path.join(ROOT, "content", "audio_manifest.json"), encoding="utf-8"))

done = skipped = failed = 0
fail_list = []
lock = threading.Lock()
start = time.time()

def synth(job):
    global done, skipped, failed
    out = os.path.join(ROOT, job["path"].replace("/", os.sep))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and os.path.getsize(out) > 1024:
        with lock:
            skipped += 1
        return
    body = json.dumps({
        "text": job["text"],
        "model_id": MODEL,
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.85,
                           "style": 0.0, "use_speaker_boost": True},
    }).encode("utf-8")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{job['voice']}?output_format={OUTFMT}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=body, method="POST", headers={
                "xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 512:
                raise RuntimeError(f"tiny response {len(data)}B")
            tmp = out + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, out)
            with lock:
                done += 1
                n = done + skipped
                if n % 50 == 0 or n == len(manifest):
                    el = time.time() - start
                    print(f"  {n}/{len(manifest)}  (new={done} skip={skipped} fail={failed})  {el:.0f}s", flush=True)
            return
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and attempt < 3:
                time.sleep(2 ** attempt + 1); continue
            with lock:
                failed += 1; fail_list.append({"path": job["path"], "err": f"HTTP {e.code}"})
            return
        except Exception as e:
            if attempt < 3:
                time.sleep(2 ** attempt + 1); continue
            with lock:
                failed += 1; fail_list.append({"path": job["path"], "err": str(e)})
            return

print(f"Synthesizing {len(manifest)} clips with {WORKERS} workers...", flush=True)
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    list(ex.map(synth, manifest))

print(f"\nDONE  new={done}  skipped={skipped}  failed={failed}  in {time.time()-start:.0f}s", flush=True)
if fail_list:
    json.dump(fail_list, open(os.path.join(ROOT, "content", "audio_failures.json"), "w"), indent=1)
    print(f"  {len(fail_list)} failures written to content/audio_failures.json", flush=True)
    sys.exit(1)
