#!/usr/bin/env python3
# One-shot: fix Supabase GoTrue auth config for kankoku.focusimmersion.com.
# - Site URL + redirect allow list (makes the magic LINK path work)
# - Magic Link + Confirm Signup templates include {{ .Token }} (makes 6-digit CODE entry work)
# Run: python scripts/set_auth_config.py <PAT>
import sys, json, urllib.request

PAT = sys.argv[1]
REF = "ylceljdbapxeynyqphcr"
URL = f"https://api.supabase.com/v1/projects/{REF}/config/auth"

CODE_TEMPLATE = (
    "<h2>Korean Weekend Sprint</h2>\n"
    "<p>Your 6-digit sign-in code:</p>\n"
    '<p style="font-size:30px;font-weight:bold;letter-spacing:5px;margin:8px 0">{{ .Token }}</p>\n'
    "<p>Enter it in the app to sign in.</p>\n"
    '<p style="color:#888;font-size:13px">Or, on this same phone, you can tap: '
    '<a href="{{ .ConfirmationURL }}">Sign in</a></p>\n'
)

body = {
    "site_url": "https://kankoku.focusimmersion.com",
    "uri_allow_list": ",".join([
        "https://kankoku.focusimmersion.com/**",
        "http://kankoku.focusimmersion.com/**",
        "http://localhost:3000/**",
    ]),
    "mailer_templates_magic_link_content": CODE_TEMPLATE,
    "mailer_templates_confirmation_content": CODE_TEMPLATE,
}

req = urllib.request.Request(
    URL, data=json.dumps(body).encode(), method="PATCH",
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "curl/8.4.0"},
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        print("HTTP", r.status)
        print("site_url       ->", d.get("site_url"))
        print("uri_allow_list ->", d.get("uri_allow_list"))
        print("magic tmpl has .Token  ->", "{{ .Token }}" in (d.get("mailer_templates_magic_link_content") or ""))
        print("signup tmpl has .Token ->", "{{ .Token }}" in (d.get("mailer_templates_confirmation_content") or ""))
        print("OK")
except urllib.error.HTTPError as e:
    print("HTTP_ERROR", e.code, e.read().decode()[:500])
except Exception as e:
    print("ERROR", repr(e))
