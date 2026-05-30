/* ============================================================
   KO Weekend Sprint — app logic
   Auth (email OTP) -> allowlist gate -> content + FSRS review.
   Vanilla JS, hash-routed, mobile-first.
   ============================================================ */
(function () {
  "use strict";
  const CFG = window.KO_CONFIG;
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const HANGUL_DIRS = ["hangul_symbol_to_sound", "hangul_sound_to_symbol"];
  const WRITE_DIRS = ["hangul_symbol_to_write", "hangul_write_to_symbol"];
  const WORD_DIRS = ["word_ko_to_en", "word_audio_to_meaning"];
  const MASTER_STABILITY = 3;

  // Syllable-block composition examples (tiny UI scaffolding, not corpus content).
  const SYLLABLE_BLOCKS = {
    "가": { components: ["ㄱ", "ㅏ"], note: "Vertical vowel ㅏ goes to the RIGHT of ㄱ." },
    "나": { components: ["ㄴ", "ㅏ"], note: "ㅏ to the right of ㄴ." },
    "고": { components: ["ㄱ", "ㅗ"], note: "Horizontal vowel ㅗ goes BELOW ㄱ." },
    "구": { components: ["ㄱ", "ㅜ"], note: "Horizontal vowel ㅜ goes below ㄱ." },
    "다": { components: ["ㄷ", "ㅏ"], note: "ㅏ to the right of ㄷ." },
    "사": { components: ["ㅅ", "ㅏ"], note: "ㅏ to the right of ㅅ." },
    "한": { components: ["ㅎ", "ㅏ", "ㄴ"], note: "ㅎ + ㅏ on top, final ㄴ (batchim) at the BOTTOM." },
    "국": { components: ["ㄱ", "ㅜ", "ㄱ"], note: "ㄱ + ㅜ, then a final ㄱ at the bottom." },
    "말": { components: ["ㅁ", "ㅏ", "ㄹ"], note: "ㅁ + ㅏ on top, final ㄹ at the bottom." },
  };
  const DAY = 86400000;
  const RATING_NAME = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

  const state = {
    user: null,
    items: { hangul: [], words: [] },
    byId: {},
    cards: new Map(), // key item_id::direction -> card row
    route: "dashboard",
  };

  // ---------- tiny helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const root = () => document.getElementById("root");
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ck = (itemId, dir) => itemId + "::" + dir;
  const audioURL = (path) => (path ? CFG.AUDIO_BASE + path : null);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ---------- audio ----------
  const audioEl = new Audio();
  let currentBtn = null;
  function play(path, btn) {
    const url = audioURL(path);
    if (!url) return;
    try {
      audioEl.pause();
      if (currentBtn) currentBtn.classList.remove("playing");
      audioEl.src = url;
      currentBtn = btn || null;
      if (currentBtn) currentBtn.classList.add("playing");
      audioEl.play().catch(() => {});
    } catch (e) {}
  }
  audioEl.addEventListener("ended", () => {
    if (currentBtn) currentBtn.classList.remove("playing");
    currentBtn = null;
  });

  // localStorage: vanity "viewed words" set
  const viewedKey = () => "ko_viewed_" + (state.user ? state.user.id : "anon");
  function markViewed(id) {
    try {
      const s = new Set(JSON.parse(localStorage.getItem(viewedKey()) || "[]"));
      s.add(id);
      localStorage.setItem(viewedKey(), JSON.stringify([...s]));
    } catch (e) {}
  }
  function viewedCount() {
    try {
      return JSON.parse(localStorage.getItem(viewedKey()) || "[]").length;
    } catch (e) {
      return 0;
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  function renderAuth(stage, email, msg, msgClass) {
    root().innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="logo">KO <b>Sprint</b></div>
        <p style="color:var(--ink-soft);margin:-4px 0 6px">Korean, in a weekend. Invite-only.</p>
        ${
          stage === "email"
            ? `<input id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" value="${esc(email || "")}" />
               <button class="submit" id="sendBtn">Email me a sign-in code</button>`
            : `<p style="color:var(--ink-soft);font-size:.9rem">We emailed a <b>6-digit code</b> to <b>${esc(email)}</b>.<br>Enter it below to sign in.</p>
               <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" style="letter-spacing:.3em;font-size:1.2rem" />
               <button class="submit" id="verifyBtn">Sign in</button>
               <p style="color:var(--ink-faint);font-size:.78rem;margin:6px 0 2px">On this phone you can also tap the link in that email.</p>
               <button id="backBtn" style="color:var(--ink-soft);font-size:.85rem">Use a different email</button>`
        }
        <div class="auth-msg ${msgClass || ""}" id="authMsg">${esc(msg || "")}</div>
      </div></div>`;

    if (stage === "email") {
      const send = async () => {
        const em = $("#email").value.trim().toLowerCase();
        if (!em || !em.includes("@")) return setMsg("Please enter a valid email.", "err");
        setMsg("Sending…");
        $("#sendBtn").disabled = true;
        const { error } = await sb.auth.signInWithOtp({
          email: em,
          options: { shouldCreateUser: true, emailRedirectTo: location.href.split("#")[0] },
        });
        $("#sendBtn").disabled = false;
        if (error) return setMsg(error.message, "err");
        renderAuth("code", em, "Check your inbox (and spam).", "ok");
        // If the user taps the link on this device, detectSessionInUrl logs them in;
        // re-check the session when the tab regains focus.
        window.addEventListener("focus", recheckSession);
      };
      $("#sendBtn").onclick = send;
      $("#email").onkeydown = (e) => e.key === "Enter" && send();
      $("#email").focus();
    } else {
      const verify = async () => {
        const token = $("#code").value.trim();
        if (token.length < 6) return setMsg("Enter the 6-digit code.", "err");
        setMsg("Verifying…");
        $("#verifyBtn").disabled = true;
        const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
        $("#verifyBtn").disabled = false;
        if (error) return setMsg(error.message, "err");
        boot(data.user);
      };
      $("#verifyBtn").onclick = verify;
      $("#code").onkeydown = (e) => e.key === "Enter" && verify();
      $("#backBtn").onclick = () => renderAuth("email", email);
      $("#code").focus();
    }
    function setMsg(m, c) {
      const el = $("#authMsg");
      el.textContent = m;
      el.className = "auth-msg " + (c || "");
    }
  }

  function renderDenied(email) {
    root().innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="logo">KO <b>Sprint</b></div>
        <div class="empty"><div class="ic">🔒</div>
          <h3>Not on the list yet</h3>
          <p><b>${esc(email)}</b> isn't on the invite list.<br>Ask the Focus Immersion host to add you, then sign in again.</p>
        </div>
        <button class="submit" id="out">Sign out</button>
      </div></div>`;
    $("#out").onclick = async () => {
      await sb.auth.signOut();
      location.hash = "";
      start();
    };
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  async function boot(user) {
    state.user = user;
    root().innerHTML = `<div class="center-load"><div class="spinner"></div></div>`;

    // allowlist gate
    const { data: allow } = await sb
      .from("ko_sprint_allowed_users")
      .select("email,display_name")
      .limit(1);
    if (!allow || allow.length === 0) {
      return renderDenied(user.email);
    }
    state.displayName = (allow[0] && allow[0].display_name) || user.email.split("@")[0];

    await loadContent();
    await loadCards();
    if (!location.hash) location.hash = "#/";
    routeFromHash();
  }

  async function loadContent() {
    const { data, error } = await sb
      .from("ko_sprint_learning_items")
      .select("id,item_type,sort_order,payload")
      .order("item_type", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      toast("Could not load content");
      return;
    }
    state.items.hangul = [];
    state.items.words = [];
    state.byId = {};
    (data || []).forEach((it) => {
      state.byId[it.id] = it;
      if (it.item_type === "hangul") state.items.hangul.push(it);
      else state.items.words.push(it);
    });
    await enrichHangulStrokes();
  }

  async function enrichHangulStrokes() {
    const needsStrokes = state.items.hangul.some(
      (it) => it.payload.group !== "batchim_overview" && !Array.isArray(it.payload.strokes)
    );
    if (!needsStrokes) return;
    try {
      const res = await fetch("./content/hangul_strokes.json", { cache: "no-store" });
      if (!res.ok) return;
      const strokes = await res.json();
      state.items.hangul.forEach((it) => {
        const s = strokes[it.payload.symbol];
        if (Array.isArray(s) && s.length) {
          it.payload.strokes = s;
          it.payload.stroke_count = s.length;
        }
      });
    } catch (e) {}
  }

  async function loadCards() {
    const { data } = await sb
      .from("ko_sprint_fsrs_cards")
      .select("*")
      .eq("user_id", state.user.id);
    state.cards = new Map();
    (data || []).forEach((c) => state.cards.set(ck(c.item_id, c.direction), c));
  }

  function dirsFor(item) {
    if (item.item_type === "hangul") {
      return item.payload.group === "batchim_overview" ? [] : HANGUL_DIRS;
    }
    return WORD_DIRS;
  }
  // Writing track is scheduled completely separately from recognition.
  function writeDirsFor(item) {
    return item.item_type === "hangul" &&
      item.payload.group !== "batchim_overview" &&
      Array.isArray(item.payload.strokes)
      ? WRITE_DIRS
      : [];
  }
  function writeMastered(item) {
    const dirs = writeDirsFor(item);
    if (!dirs.length) return false;
    return dirs.every((d) => {
      const c = state.cards.get(ck(item.id, d));
      return c && c.state === "review" && (c.stability || 0) >= MASTER_STABILITY;
    });
  }
  function writeNewPool() {
    const pool = [];
    reviewableHangul().forEach((item) =>
      writeDirsFor(item).forEach((d) => {
        if (!state.cards.get(ck(item.id, d))) pool.push({ item, direction: d });
      })
    );
    return pool;
  }
  function writeDueCount() {
    const now = Date.now();
    let n = 0;
    state.cards.forEach((c) => {
      if (WRITE_DIRS.includes(c.direction) && c.due && new Date(c.due).getTime() <= now) n++;
    });
    return n;
  }

  // ============================================================
  // PERSIST a review outcome
  // ============================================================
  async function commitReview(item, direction, baseCard, outcome) {
    const prev = baseCard || FSRS.newCard();
    const row = {
      user_id: state.user.id,
      item_id: item.id,
      direction,
      due: outcome.due,
      stability: outcome.stability,
      difficulty: outcome.difficulty,
      reps: outcome.reps,
      lapses: outcome.lapses,
      state: outcome.state,
      last_review: outcome.last_review,
      updated_at: new Date().toISOString(),
      scheduled_days: Math.max(
        0,
        Math.round((new Date(outcome.due) - new Date(outcome.last_review)) / DAY)
      ),
    };
    if (prev.id) row.id = prev.id;
    const { data, error } = await sb
      .from("ko_sprint_fsrs_cards")
      .upsert(row, { onConflict: "user_id,item_id,direction" })
      .select()
      .single();
    if (error) {
      toast("Save failed — check connection");
      return null;
    }
    state.cards.set(ck(item.id, direction), data);
    // log (non-fatal)
    sb.from("ko_sprint_review_logs")
      .insert({
        user_id: state.user.id,
        card_id: data.id,
        rating: RATING_NAME[outcome.rating],
        response_ms: outcome.response_ms || null,
        device: navigator.userAgent.slice(0, 80),
      })
      .then(() => {});
    return data;
  }

  // ============================================================
  // STATS
  // ============================================================
  function isMastered(item) {
    const dirs = dirsFor(item);
    if (!dirs.length) return false;
    return dirs.every((d) => {
      const c = state.cards.get(ck(item.id, d));
      return c && c.state === "review" && (c.stability || 0) >= MASTER_STABILITY;
    });
  }
  function isSeen(item) {
    return dirsFor(item).some((d) => state.cards.get(ck(item.id, d)));
  }
  function reviewableHangul() {
    return state.items.hangul.filter((h) => h.payload.group !== "batchim_overview");
  }
  function dueCount(scope) {
    const now = Date.now();
    let n = 0;
    state.cards.forEach((c) => {
      const item = state.byId[c.item_id];
      if (!item) return;
      if (scope === "hangul" && item.item_type !== "hangul") return;
      if (scope === "words" && item.item_type !== "word") return;
      if (c.due && new Date(c.due).getTime() <= now) n++;
    });
    return n;
  }
  function newPool(scope) {
    const pool = [];
    const add = (list) =>
      list.forEach((item) =>
        dirsFor(item).forEach((d) => {
          if (!state.cards.get(ck(item.id, d))) pool.push({ item, direction: d });
        })
      );
    if (scope !== "words") add(reviewableHangul());
    if (scope !== "hangul") add(state.items.words);
    return pool;
  }

  // ============================================================
  // ROUTER + SHELL
  // ============================================================
  function shell(active, inner) {
    return `
      <div class="app">
        <div class="topbar">
          <div class="mark"><span class="logo">KO <b>Sprint</b></span></div>
          <button class="iconbtn" id="logoutBtn" title="Sign out">⎋</button>
        </div>
        ${inner}
      </div>
      <nav class="nav nav-6">
        ${navBtn("/", "🏠", "Home", active)}
        ${navBtn("/hangul", "가", "Sounds", active)}
        ${navBtn("/write", "✍", "Write", active)}
        ${navBtn("/words", "📖", "Words", active)}
        ${navBtn("/review", "🎯", "Review", active)}
        ${navBtn("/progress", "📈", "Stats", active)}
      </nav>`;
  }
  function navBtn(path, ic, label, active) {
    const on = active === path ? "active" : "";
    return `<button class="${on}" data-nav="#${path}"><span class="ic">${ic}</span>${label}</button>`;
  }
  function wireShell() {
    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.onclick = () => (location.hash = b.getAttribute("data-nav"));
    });
    const lo = document.getElementById("logoutBtn");
    if (lo)
      lo.onclick = async () => {
        await sb.auth.signOut();
        location.hash = "";
        start();
      };
  }

  function routeFromHash() {
    const h = (location.hash || "#/").replace(/^#/, "");
    if (h.startsWith("/hangul")) viewHangul();
    else if (h.startsWith("/write")) viewWrite();
    else if (h.startsWith("/words")) viewWords();
    else if (h.startsWith("/review")) viewReview();
    else if (h.startsWith("/progress")) viewProgress();
    else viewDashboard();
  }
  window.addEventListener("hashchange", () => {
    if (state.user) routeFromHash();
  });

  // ============================================================
  // VIEW: DASHBOARD
  // ============================================================
  function viewDashboard() {
    const hMaster = reviewableHangul().filter(isMastered).length;
    const wMaster = state.items.words.filter(isMastered).length;
    const due = dueCount("all");
    const newAvail = newPool("all").length;
    const sentencesViewed = Math.min(viewedCount() * 3, CFG.SPRINT.goalWords * 3);
    const pct = (a, b) => Math.round((100 * a) / b) + "%";

    const inner = `
      <div class="card hero">
        <p class="eyebrow">Weekend Sprint</p>
        <h1>안녕, ${esc(state.displayName)} 👋</h1>
        <p>${due > 0 ? `${due} card${due === 1 ? "" : "s"} ready to review.` : newAvail > 0 ? "Time to learn something new." : "You're all caught up. 잘했어요!"}</p>
      </div>

      <button class="cta ${due + newAvail === 0 ? "dim" : ""}" data-nav="#/review">
        <span>${due > 0 ? "Review due cards" : "Start learning"}</span>
        <span class="due-pill">${due > 0 ? due + " due" : newAvail + " new"}</span>
      </button>

      <div class="card card-pad" style="display:grid;gap:14px">
        <div class="goal-grid">
          <div class="goal">
            <span class="k">Hangul</span>
            <span class="v">${hMaster}<small> / ${CFG.SPRINT.goalHangul}</small></span>
            <div class="bar teal"><i style="width:${pct(hMaster, CFG.SPRINT.goalHangul)}"></i></div>
          </div>
          <div class="goal">
            <span class="k">Words</span>
            <span class="v">${wMaster}<small> / ${CFG.SPRINT.goalWords}</small></span>
            <div class="bar"><i style="width:${pct(wMaster, CFG.SPRINT.goalWords)}"></i></div>
          </div>
        </div>
        <div class="goal">
          <span class="k">Sentences viewed</span>
          <span class="v">${sentencesViewed}<small> / ${CFG.SPRINT.goalWords * 3}</small></span>
          <div class="bar gold"><i style="width:${pct(sentencesViewed, CFG.SPRINT.goalWords * 3)}"></i></div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="v">${due}</div><div class="k">Due now</div></div>
        <div class="stat"><div class="v">${newAvail}</div><div class="k">New left</div></div>
        <div class="stat"><div class="v">${reviewableHangul().filter(isSeen).length + state.items.words.filter(isSeen).length}</div><div class="k">Seen</div></div>
      </div>

      <div class="row-actions">
        <button class="tile-link" data-nav="#/hangul"><span class="ic">가</span><span class="t">Hangul board</span><span class="s">40 letters &amp; sounds</span></button>
        <button class="tile-link" data-nav="#/words"><span class="ic">📖</span><span class="t">Top 300 words</span><span class="s">with audio &amp; sentences</span></button>
      </div>`;
    root().innerHTML = shell("/", inner);
    wireShell();
  }

  // ============================================================
  // VIEW: HANGUL BOARD
  // ============================================================
  const GROUP_LABELS = {
    basic_consonant: "Basic consonants",
    tense_consonant: "Tense consonants",
    basic_vowel: "Basic vowels",
    compound_vowel: "Compound vowels",
    batchim_overview: "Final consonants (batchim)",
  };
  function viewHangul() {
    const groups = {};
    state.items.hangul.forEach((it) => {
      (groups[it.payload.group] = groups[it.payload.group] || []).push(it);
    });
    let body = "";
    Object.keys(GROUP_LABELS).forEach((g) => {
      const list = groups[g];
      if (!list) return;
      body += `<div class="group-title"><h3>${GROUP_LABELS[g]}</h3><span class="cnt">${list.length}</span></div>`;
      if (g === "batchim_overview") {
        body += `<div class="hangul-grid"><button class="hletter" data-hid="${list[0].id}" style="grid-column:1 / -1;aspect-ratio:auto;padding:14px"><span class="sym" style="font-size:1.4rem">받침 ⓘ</span></button></div>`;
      } else {
        body += `<div class="hangul-grid">${list
          .map((it) => {
            const known = isMastered(it) ? "known" : "";
            return `<button class="hletter ${known}" data-hid="${it.id}"><span class="sym">${esc(it.payload.symbol)}</span><span class="rom">${esc(it.payload.romanization)}</span></button>`;
          })
          .join("")}</div>`;
      }
    });
    const inner = `<div class="card hero" style="padding:16px"><p class="eyebrow">Sound Board</p><h1 class="h-serif" style="font-size:1.5rem">Hangul 한글</h1><p>Tap a letter to hear it and see example words.</p></div>${body}`;
    root().innerHTML = shell("/hangul", inner);
    wireShell();
    document.querySelectorAll("[data-hid]").forEach((b) => {
      b.onclick = () => openHangulSheet(b.getAttribute("data-hid"));
    });
  }

  function openHangulSheet(id) {
    const it = state.byId[id];
    const p = it.payload;
    const isBatchim = p.group === "batchim_overview";
    const exHtml = (p.examples || [])
      .map(
        (e) => `
      <button class="ex" data-aud="${esc(e.audio_path)}">
        <span class="play-mini">▶</span>
        <span class="txt"><span class="ko">${esc(e.ko)}<small>${esc(e.romaja)}</small></span><span class="en">${esc(e.en)}</span></span>
      </button>`
      )
      .join("");
    const controls = isBatchim
      ? ""
      : `<div class="sheet-controls">
           <button class="btn known" id="mkKnown">✓ I know this</button>
           <button class="btn later" id="mkLater">Review later</button>
         </div>`;
    openSheet(`
      <div class="sheet-hero">
        <div class="big">${esc(p.symbol)}</div>
        <div class="rom">${esc(p.romanization)}</div>
        <div class="en">${esc(p.name_ko)}${isBatchim ? "" : " · letter name"}</div>
      </div>
      ${isBatchim ? "" : `<div style="text-align:center;margin-bottom:12px"><button class="play lg" data-aud="${esc(p.audio_path)}">🔊 Play letter name</button></div>`}
      <div class="note ${p.position_note ? "warn" : ""}">${esc(p.sound_note)}${p.position_note ? `<br><b>Note:</b> ${esc(p.position_note)}` : ""}</div>
      <div class="section-label">Example words</div>
      <div class="ex-list">${exHtml}</div>
      ${controls}
    `);
    wireSheetAudio();
    if (!isBatchim) {
      $("#mkKnown").onclick = async () => {
        await markKnown(it);
        closeSheet();
        toast("Marked as known");
        viewHangul();
      };
      $("#mkLater").onclick = async () => {
        await markLater(it);
        closeSheet();
        toast("Added to review");
      };
    }
  }

  // ============================================================
  // VIEW: WORDS
  // ============================================================
  function viewWords() {
    const inner = `
      <div class="card hero" style="padding:16px"><p class="eyebrow">Vocabulary</p><h1 class="h-serif" style="font-size:1.5rem">Top 300 Words</h1></div>
      <input class="search" id="wsearch" placeholder="Search Korean, English, or romanization…" />
      <div class="word-list" id="wlist"></div>`;
    root().innerHTML = shell("/words", inner);
    wireShell();
    const listEl = $("#wlist");
    const renderList = (q) => {
      q = (q || "").trim().toLowerCase();
      const items = state.items.words.filter((it) => {
        if (!q) return true;
        const p = it.payload;
        return (
          p.ko.includes(q) ||
          (p.en || "").toLowerCase().includes(q) ||
          (p.romaja || "").toLowerCase().includes(q)
        );
      });
      listEl.innerHTML = items
        .slice(0, 320)
        .map((it) => {
          const p = it.payload;
          const known = isMastered(it) ? "known" : "";
          return `<div class="word-row ${known}" data-wid="${it.id}">
            <span class="rk">${p.rank}</span>
            <span class="main"><span class="ko">${esc(p.ko)}</span> <span class="en">${esc(p.en)}</span></span>
            <button class="play-mini" data-aud="${esc(p.audio_path)}" data-stop="1">▶</button>
          </div>`;
        })
        .join("");
      listEl.querySelectorAll("[data-wid]").forEach((row) => {
        row.onclick = (e) => {
          if (e.target.closest("[data-stop]")) return;
          openWordSheet(row.getAttribute("data-wid"));
        };
      });
      listEl.querySelectorAll("[data-stop]").forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          play(b.getAttribute("data-aud"), b);
        };
      });
    };
    renderList("");
    $("#wsearch").oninput = (e) => renderList(e.target.value);
  }

  function openWordSheet(id) {
    const it = state.byId[id];
    const p = it.payload;
    markViewed(it.id);
    const sentHtml = (p.sentences || [])
      .map(
        (s) => `
      <button class="ex" data-aud="${esc(s.audio_path)}">
        <span class="play-mini">▶</span>
        <span class="txt"><span class="ko">${esc(s.ko)}</span><span class="en">${esc(s.romaja)} — ${esc(s.en)}</span></span>
      </button>`
      )
      .join("");
    openSheet(`
      <div class="sheet-hero">
        <div class="big word">${esc(p.ko)}</div>
        <div class="rom">${esc(p.romaja)}</div>
        <div class="en">${esc(p.en)}</div>
        <div class="meta">#${p.rank} · ${esc(p.pos)}</div>
      </div>
      <div style="text-align:center;margin-bottom:12px"><button class="play lg" data-aud="${esc(p.audio_path)}">🔊 Play word</button></div>
      <div class="section-label">Example sentences</div>
      <div class="sent-list">${sentHtml}</div>
      <div class="sheet-controls">
        <button class="btn known" id="mkKnown">✓ I know this</button>
        <button class="btn later" id="mkLater">Review later</button>
      </div>
    `);
    wireSheetAudio();
    $("#mkKnown").onclick = async () => {
      await markKnown(it);
      closeSheet();
      toast("Marked as known");
      viewWords();
    };
    $("#mkLater").onclick = async () => {
      await markLater(it);
      closeSheet();
      toast("Added to review");
    };
  }

  // ---------- mark known / later ----------
  async function markKnown(item) {
    for (const d of dirsFor(item)) {
      const base = state.cards.get(ck(item.id, d)) || FSRS.newCard();
      const outcomes = FSRS.schedule(base, new Date());
      await commitReview(item, d, base, outcomes[4]); // treat as "easy"
    }
  }
  async function markLater(item) {
    for (const d of dirsFor(item)) {
      if (state.cards.get(ck(item.id, d))) continue;
      const now = new Date();
      await commitReview(item, d, FSRS.newCard(), {
        rating: 2,
        state: "learning",
        stability: null,
        difficulty: null,
        reps: 0,
        lapses: 0,
        due: now.toISOString(),
        last_review: now.toISOString(),
      });
    }
  }

  // ============================================================
  // SHEET primitives
  // ============================================================
  function openSheet(html) {
    let bd = document.getElementById("sheetBackdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.id = "sheetBackdrop";
      bd.className = "sheet-backdrop";
      document.body.appendChild(bd);
    }
    bd.innerHTML = `<div class="sheet" id="sheet"><div class="grab"></div>${html}</div>`;
    bd.classList.remove("hidden");
    bd.onclick = (e) => {
      if (e.target === bd) closeSheet();
    };
  }
  function closeSheet() {
    const bd = document.getElementById("sheetBackdrop");
    if (bd) bd.remove();
    audioEl.pause();
  }
  function wireSheetAudio() {
    document.querySelectorAll("#sheet [data-aud]").forEach((b) => {
      b.onclick = () => play(b.getAttribute("data-aud"), b);
    });
  }

  // ============================================================
  // VIEW: REVIEW (FSRS engine)
  // ============================================================
  const review = { queue: [], idx: 0, revealed: false, scope: "all", track: "recog", startedAt: 0 };
  const isWriteDir = (d) => WRITE_DIRS.includes(d);

  function buildQueue(scope) {
    const now = Date.now();
    const write = review.track === "write";
    const inTrack = (d) => (write ? isWriteDir(d) : !isWriteDir(d));
    const due = [];
    state.cards.forEach((c) => {
      const item = state.byId[c.item_id];
      if (!item || !inTrack(c.direction)) return;
      if (scope === "hangul" && item.item_type !== "hangul") return;
      if (scope === "words" && item.item_type !== "word") return;
      if (c.due && new Date(c.due).getTime() <= now)
        due.push({ item, direction: c.direction, card: c });
    });
    due.sort((a, b) => new Date(a.card.due) - new Date(b.card.due));

    const pool = shuffle(write ? writeNewPool() : newPool(scope));
    const limit = write
      ? CFG.SPRINT.newHangulPerSession * 2
      : (scope !== "words" ? CFG.SPRINT.newHangulPerSession : 0) +
        (scope !== "hangul" ? CFG.SPRINT.newWordsPerSession : 0);
    const fresh = pool.slice(0, limit).map((x) => ({ ...x, card: FSRS.newCard() }));

    return due.concat(fresh).slice(0, CFG.SPRINT.maxDailyReviews);
  }

  function viewReview() {
    const q = location.hash.split("?")[1] || "";
    review.track = q.includes("write") ? "write" : "recog";
    review.scope = q.includes("hangul") ? "hangul" : q.includes("words") ? "words" : "all";
    review.queue = buildQueue(review.scope);
    review.idx = 0;
    review.revealed = false;
    renderReview();
  }

  function renderReview() {
    if (review.idx >= review.queue.length) return renderReviewDone();
    const entry = review.queue[review.idx];
    if (isWriteDir(entry.direction)) return renderWriteCard(entry);
    const { item, direction, card } = entry;
    const p = item.payload;
    review.startedAt = Date.now();
    const total = review.queue.length;
    const pos = review.idx + 1;
    const progressPct = Math.round((100 * review.idx) / total);

    let q = "",
      a = "",
      autoplay = null;
    if (direction === "hangul_symbol_to_sound") {
      q = `<div class="dir-tag">Letter → sound</div><div class="q-sym">${esc(p.symbol)}</div>`;
      a = `<div class="a-sym" style="font-size:2rem">${esc(p.name_ko)}</div><div class="a-rom">${esc(p.romanization)}</div><div class="a-extra">${esc(p.sound_note)}</div>`;
    } else if (direction === "hangul_sound_to_symbol") {
      q = `<div class="dir-tag">Sound → letter</div><div class="q-audio"><button class="play lg" id="qaudio">🔊 Play sound</button><div class="hint">name: ${esc(p.name_ko)} · "${esc(p.romanization)}"</div></div>`;
      a = `<div class="a-sym">${esc(p.symbol)}</div>`;
      autoplay = p.audio_path;
    } else if (direction === "word_ko_to_en") {
      q = `<div class="dir-tag">Korean → meaning</div><div class="q-word">${esc(p.ko)}</div>`;
      a = `<div class="a-rom">${esc(p.romaja)}</div><div class="a-en">${esc(p.en)}</div><div class="a-extra">${esc(p.pos)}</div>`;
    } else {
      q = `<div class="dir-tag">Listen → meaning</div><div class="q-audio"><button class="play lg" id="qaudio">🔊 Play word</button><div class="hint">What does it mean?</div></div>`;
      a = `<div class="a-sym" style="font-size:2.4rem">${esc(p.ko)}</div><div class="a-rom">${esc(p.romaja)}</div><div class="a-en">${esc(p.en)}</div>`;
      autoplay = p.audio_path;
    }

    const inner = `
      <div class="review-wrap">
        <div class="review-top">
          <button class="iconbtn" data-nav="#/">✕</button>
          <div class="review-progress"><div class="bar"><i style="width:${progressPct}%"></i></div></div>
          <div class="dir-tag" style="font-variant-numeric:tabular-nums">${pos}/${total}</div>
        </div>
        <div class="qcard">
          ${q}
          ${review.revealed ? `<div class="divider"></div><div class="answer">${a}</div>` : ""}
        </div>
        ${
          review.revealed
            ? gradeButtons(card)
            : `<button class="reveal-btn" id="revealBtn">Show answer</button>`
        }
        ${
          review.revealed && (p.audio_path && (item.item_type === "word"))
            ? `<button class="play ghost" id="replay" style="justify-self:center">🔊 Replay</button>`
            : ""
        }
      </div>`;
    root().innerHTML = shell("/review", inner);
    wireShell();

    const qa = document.getElementById("qaudio");
    if (qa) qa.onclick = () => play(autoplay, qa);
    if (autoplay) setTimeout(() => play(autoplay, qa), 180);

    if (!review.revealed) {
      $("#revealBtn").onclick = () => {
        review.revealed = true;
        renderReview();
      };
    } else {
      const rp = document.getElementById("replay");
      if (rp) rp.onclick = () => play(p.audio_path, rp);
      document.querySelectorAll("[data-grade]").forEach((b) => {
        b.onclick = () => grade(parseInt(b.getAttribute("data-grade"), 10));
      });
    }
  }

  function gradeButtons(card) {
    const base = card || FSRS.newCard();
    const o = FSRS.schedule(base, new Date());
    const btn = (g, cls, label) =>
      `<button class="grade ${cls}" data-grade="${g}">${label}<small>${o[g].label}</small></button>`;
    return `<div class="grade-grid">
      ${btn(1, "again", "Again")}
      ${btn(2, "hard", "Hard")}
      ${btn(3, "good", "Good")}
      ${btn(4, "easy", "Easy")}
    </div>`;
  }

  async function grade(g) {
    const entry = review.queue[review.idx];
    const base = entry.card || FSRS.newCard();
    const outcome = FSRS.schedule(base, new Date())[g];
    outcome.response_ms = Date.now() - review.startedAt;
    await commitReview(entry.item, entry.direction, base, outcome);
    review.idx++;
    review.revealed = false;
    renderReview();
  }

  function renderReviewDone() {
    const write = review.track === "write";
    const dueLeft = write ? writeDueCount() : dueCount("all");
    const newLeft = write ? writeNewPool().length : newPool("all").length;
    const back = write ? "#/review?write" : "#/review";
    const homeNav = write ? "#/write" : "#/";
    const inner = `
      <div class="empty" style="margin-top:30px">
        <div class="ic">🎉</div>
        <h3>${write ? "Writing session done" : "Session complete"}</h3>
        <p>You ${write ? "practiced" : "reviewed"} ${review.queue.length} card${review.queue.length === 1 ? "" : "s"}.<br>${dueLeft} still due · ${newLeft} new remaining.</p>
      </div>
      ${
        dueLeft + newLeft > 0
          ? `<button class="cta" data-nav="${back}"><span>Keep going</span><span class="due-pill">${dueLeft + Math.min(newLeft, 50)} ready</span></button>`
          : ""
      }
      <div class="row-actions" style="margin-top:12px">
        <button class="tile-link" data-nav="${homeNav}"><span class="ic">🏠</span><span class="t">${write ? "Writing home" : "Dashboard"}</span></button>
        <button class="tile-link" data-nav="#/progress"><span class="ic">📈</span><span class="t">Progress</span></button>
      </div>`;
    root().innerHTML = shell(write ? "/write" : "/review", inner);
    wireShell();
  }

  // ============================================================
  // WRITING: stroke animator + tracing canvas
  // ============================================================
  function animatorMarkup(strokes) {
    const paths = (strokes || [])
      .map((s, i) => `<path class="stk" data-i="${i}" d="${s.d}"/>`)
      .join("");
    return `<svg class="stroke-svg" viewBox="0 0 100 100" aria-hidden="true">
      <g class="grid"><line x1="50" y1="6" x2="50" y2="94"/><line x1="6" y1="50" x2="94" y2="50"/></g>
      ${paths}</svg>`;
  }
  function playAnimator(svg, speed) {
    if (!svg) return;
    if (svg._timers) svg._timers.forEach(clearTimeout);
    svg._timers = [];
    const paths = [...svg.querySelectorAll("path.stk")];
    paths.forEach((p) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.classList.remove("cur");
    });
    svg.getBoundingClientRect();
    let delay = 0;
    paths.forEach((p) => {
      const len = p.getTotalLength();
      const dur = Math.max(260, (len * 7) / speed);
      svg._timers.push(
        setTimeout(() => {
          p.style.transition = `stroke-dashoffset ${dur}ms ease`;
          p.style.strokeDashoffset = "0";
        }, delay)
      );
      delay += dur + 140;
    });
  }
  function showStep(svg, n) {
    const paths = [...svg.querySelectorAll("path.stk")];
    n = Math.min(n, paths.length);
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = i < n ? "0" : len;
      p.classList.toggle("cur", i === n - 1);
    });
    return n >= paths.length ? 0 : n;
  }
  function mountCanvas(host, ghostStrokes, opts) {
    opts = opts || {};
    const SZ = 300;
    host.innerHTML = `<div class="trace-wrap"><canvas width="${SZ}" height="${SZ}"></canvas></div>`;
    const cv = host.querySelector("canvas");
    const ctx = cv.getContext("2d");
    let drawing = false,
      last = null,
      ghost = opts.ghost !== false,
      dirty = false;
    function bg() {
      ctx.clearRect(0, 0, SZ, SZ);
      ctx.strokeStyle = "rgba(35,38,45,.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(SZ / 2, 0); ctx.lineTo(SZ / 2, SZ);
      ctx.moveTo(0, SZ / 2); ctx.lineTo(SZ, SZ / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(35,38,45,.18)";
      ctx.strokeRect(8, 8, SZ - 16, SZ - 16);
      if (ghost && ghostStrokes) {
        ctx.save();
        ctx.scale(SZ / 100, SZ / 100);
        ctx.strokeStyle = "rgba(47,109,176,.20)";
        ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ghostStrokes.forEach((s) => ctx.stroke(new Path2D(s.d)));
        ctx.restore();
      }
    }
    function pos(e) {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * SZ) / r.width, y: ((e.clientY - r.top) * SZ) / r.height };
    }
    cv.addEventListener("pointerdown", (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.strokeStyle = "#23262d"; ctx.lineWidth = 11; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true; e.preventDefault();
    });
    cv.addEventListener("pointerup", () => { drawing = false; });
    cv.addEventListener("pointerleave", () => { drawing = false; });
    bg();
    return {
      clear() { bg(); dirty = false; },
      toggleGhost() { ghost = !ghost; bg(); return ghost; },
      get dirty() { return dirty; },
    };
  }

  // Writing review card (FSRS, separate track)
  function renderWriteCard(entry) {
    const { item, direction, card } = entry;
    const p = item.payload;
    review.startedAt = Date.now();
    const total = review.queue.length;
    const pos = review.idx + 1;
    const prog = Math.round((100 * review.idx) / total);
    const prod = direction === "hangul_write_to_symbol";
    const hideSymbol = prod && !review.revealed;

    const prompt = hideSymbol
      ? `<div class="dir-tag">Write from memory</div><div class="q-word">${esc(p.name_ko)}</div><div class="a-rom">"${esc(p.romanization)}"</div>`
      : `<div class="dir-tag">${prod ? "Write from memory" : "Trace & write"}</div><div class="q-sym">${esc(p.symbol)}</div><div class="hint" style="color:var(--ink-faint)">${esc(p.name_ko)} · ${esc(p.romanization)}</div>`;

    const inner = `
      <div class="review-wrap">
        <div class="review-top">
          <button class="iconbtn" data-nav="#/write">✕</button>
          <div class="review-progress"><div class="bar"><i style="width:${prog}%"></i></div></div>
          <div class="dir-tag" style="font-variant-numeric:tabular-nums">${pos}/${total}</div>
        </div>
        <div class="qcard write-q">${prompt}
          <button class="play ghost" id="qaudio" style="margin-top:6px">🔊 letter name</button>
        </div>
        <div class="write-stage">
          <div class="write-col">
            <div class="anim-label">Stroke order</div>
            <div id="animHost" class="${hideSymbol ? "hidden" : ""}">${animatorMarkup(p.strokes)}</div>
            ${hideSymbol ? `<button class="play ghost" id="revealBtn">Reveal letter</button>` : ""}
            <div class="anim-controls ${hideSymbol ? "hidden" : ""}">
              <button class="mini" id="replayBtn">▶ Replay</button>
              <button class="mini" id="stepBtn">Step</button>
              <button class="mini" id="speedBtn">1×</button>
            </div>
          </div>
          <div class="write-col">
            <div class="anim-label">Your writing</div>
            <div id="canvasHost"></div>
            <div class="anim-controls">
              <button class="mini" id="clearBtn">Clear</button>
              <button class="mini" id="ghostBtn">Ghost: ${prod ? "off" : "on"}</button>
            </div>
          </div>
        </div>
        ${
          hideSymbol
            ? ""
            : `<div class="grade-label">How well could you write it?</div>${gradeButtons(card)}`
        }
      </div>`;
    root().innerHTML = shell("/write", inner);
    wireShell();

    const qa = document.getElementById("qaudio");
    if (qa) qa.onclick = () => play(p.audio_path, qa);
    const canvas = mountCanvas(document.getElementById("canvasHost"), p.strokes, { ghost: !prod });
    const svg = document.querySelector("#animHost .stroke-svg");
    let speed = 1, stepN = 0;
    if (svg && !hideSymbol) setTimeout(() => playAnimator(svg, speed), 220);
    const rb = document.getElementById("replayBtn");
    if (rb) rb.onclick = () => { stepN = 0; playAnimator(svg, speed); };
    const st = document.getElementById("stepBtn");
    if (st) st.onclick = () => { stepN = showStep(svg, stepN + 1); };
    const sp = document.getElementById("speedBtn");
    if (sp) sp.onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; sp.textContent = speed + "×"; };
    document.getElementById("clearBtn").onclick = () => canvas.clear();
    const gb = document.getElementById("ghostBtn");
    gb.onclick = () => { gb.textContent = "Ghost: " + (canvas.toggleGhost() ? "on" : "off"); };
    const reveal = document.getElementById("revealBtn");
    if (reveal) reveal.onclick = () => { review.revealed = true; renderWriteCard(entry); };
    document.querySelectorAll("[data-grade]").forEach((b) => {
      b.onclick = () => grade(parseInt(b.getAttribute("data-grade"), 10));
    });
  }

  // ============================================================
  // VIEW: WRITE (Hangul writing practice)
  // ============================================================
  function viewWrite() {
    const due = writeDueCount();
    const newAvail = writeNewPool().length;
    const mastered = reviewableHangul().filter(writeMastered).length;
    const pct = Math.round((100 * mastered) / 40) + "%";

    const groups = {};
    reviewableHangul().forEach((it) => {
      (groups[it.payload.group] = groups[it.payload.group] || []).push(it);
    });
    let tiles = "";
    ["basic_consonant", "tense_consonant", "basic_vowel", "compound_vowel"].forEach((g) => {
      const list = groups[g];
      if (!list) return;
      tiles += `<div class="group-title"><h3>${GROUP_LABELS[g]}</h3><span class="cnt">${list.length}</span></div>`;
      tiles += `<div class="hangul-grid">${list
        .map((it) => {
          const known = writeMastered(it) ? "known" : "";
          return `<button class="hletter ${known}" data-wlid="${it.id}"><span class="sym">${esc(it.payload.symbol)}</span><span class="rom">${it.payload.stroke_count}✎</span></button>`;
        })
        .join("")}</div>`;
    });

    const blockTiles = Object.keys(SYLLABLE_BLOCKS)
      .map((b) => `<button class="hletter" data-block="${esc(b)}"><span class="sym">${esc(b)}</span><span class="rom">block</span></button>`)
      .join("");

    const inner = `
      <div class="card hero" style="padding:16px"><p class="eyebrow">Writing 쓰기</p><h1 class="h-serif" style="font-size:1.5rem">Hangul Writing</h1><p>Watch the stroke order, then trace it yourself.</p></div>
      <button class="cta ${due + newAvail === 0 ? "dim" : ""}" data-nav="#/review?write">
        <span>${due > 0 ? "Writing review" : "Learn to write"}</span>
        <span class="due-pill">${due > 0 ? due + " due" : newAvail + " new"}</span>
      </button>
      <div class="card card-pad"><div class="goal"><span class="k">Letters you can write</span><span class="v">${mastered}<small> / 40</small></span><div class="bar teal"><i style="width:${pct}"></i></div></div></div>
      ${tiles}
      <div class="group-title"><h3>Syllable blocks</h3><span class="cnt">how jamo combine</span></div>
      <div class="hangul-grid">${blockTiles}</div>
      <div class="group-title"><h3>Free practice</h3></div>
      <button class="tile-link" id="freePad" style="grid-column:1/-1"><span class="ic">✍</span><span class="t">Open blank practice pad</span><span class="s">Draw anything, no grading</span></button>`;
    root().innerHTML = shell("/write", inner);
    wireShell();
    document.querySelectorAll("[data-wlid]").forEach((b) => (b.onclick = () => openWriteSheet(b.getAttribute("data-wlid"))));
    document.querySelectorAll("[data-block]").forEach((b) => (b.onclick = () => openBlockSheet(b.getAttribute("data-block"))));
    document.getElementById("freePad").onclick = () => openFreePad();
  }

  // Practice sheet for a single jamo (animation + tracing, optional mark-learned)
  function openWriteSheet(id) {
    const it = state.byId[id];
    const p = it.payload;
    openSheet(`
      <div class="sheet-hero" style="padding-bottom:6px">
        <div class="rom">${esc(p.romanization)} · ${esc(p.name_ko)} · ${p.stroke_count} stroke${p.stroke_count === 1 ? "" : "s"}</div>
      </div>
      <div class="write-stage">
        <div class="write-col"><div class="anim-label">Stroke order</div><div id="sAnim">${animatorMarkup(p.strokes)}</div>
          <div class="anim-controls"><button class="mini" id="sReplay">▶ Replay</button><button class="mini" id="sStep">Step</button></div></div>
        <div class="write-col"><div class="anim-label">Trace it</div><div id="sCanvas"></div>
          <div class="anim-controls"><button class="mini" id="sClear">Clear</button><button class="mini" id="sGhost">Ghost: on</button></div></div>
      </div>
      <button class="play lg" id="sAudio" style="justify-self:center;margin:6px auto 0">🔊 ${esc(p.name_ko)}</button>
      <div class="sheet-controls"><button class="btn known" id="sLearned">✓ I can write this</button><button class="btn later" id="sClose2">Done</button></div>
    `);
    const svg = document.querySelector("#sAnim .stroke-svg");
    let stepN = 0;
    setTimeout(() => playAnimator(svg, 1), 220);
    const canvas = mountCanvas(document.getElementById("sCanvas"), p.strokes, { ghost: true });
    document.getElementById("sReplay").onclick = () => { stepN = 0; playAnimator(svg, 1); };
    document.getElementById("sStep").onclick = () => { stepN = showStep(svg, stepN + 1); };
    document.getElementById("sClear").onclick = () => canvas.clear();
    const sg = document.getElementById("sGhost");
    sg.onclick = () => { sg.textContent = "Ghost: " + (canvas.toggleGhost() ? "on" : "off"); };
    document.getElementById("sAudio").onclick = (e) => play(p.audio_path, e.currentTarget);
    document.getElementById("sLearned").onclick = async () => {
      for (const d of writeDirsFor(it)) {
        const base = state.cards.get(ck(it.id, d)) || FSRS.newCard();
        await commitReview(it, d, base, FSRS.schedule(base, new Date())[4]);
      }
      closeSheet();
      toast("Writing marked learned");
      viewWrite();
    };
    document.getElementById("sClose2").onclick = closeSheet;
  }

  function openBlockSheet(block) {
    const b = SYLLABLE_BLOCKS[block];
    const comps = b.components
      .map((c) => `<span class="hletter" style="aspect-ratio:auto;padding:8px 12px;display:inline-grid"><span class="sym" style="font-size:1.5rem">${esc(c)}</span></span>`)
      .join(`<span style="font-size:1.4rem;color:var(--ink-faint)">+</span>`);
    openSheet(`
      <div class="sheet-hero"><div class="big">${esc(block)}</div></div>
      <div style="display:flex;gap:10px;align-items:center;justify-content:center;margin-bottom:12px">${comps}</div>
      <div class="note warn"><b>How it's built:</b> ${esc(b.note)}</div>
      <div class="write-col" style="margin-top:12px"><div class="anim-label">Trace the block</div><div id="bCanvas"></div>
        <div class="anim-controls"><button class="mini" id="bClear">Clear</button></div></div>
      <div class="sheet-controls"><button class="btn later" id="bClose" style="grid-column:1/-1">Done</button></div>
    `);
    const canvas = mountCanvas(document.getElementById("bCanvas"), null, { ghost: false });
    document.getElementById("bClear").onclick = () => canvas.clear();
    document.getElementById("bClose").onclick = closeSheet;
  }

  function openFreePad() {
    openSheet(`
      <div class="sheet-hero" style="padding-bottom:4px"><div class="rom">Free practice pad</div></div>
      <div class="write-col"><div id="fCanvas"></div>
        <div class="anim-controls"><button class="mini" id="fClear">Clear</button></div></div>
      <div class="sheet-controls"><button class="btn later" id="fClose" style="grid-column:1/-1">Done</button></div>
    `);
    const canvas = mountCanvas(document.getElementById("fCanvas"), null, { ghost: false });
    document.getElementById("fClear").onclick = () => canvas.clear();
    document.getElementById("fClose").onclick = closeSheet;
  }

  // ============================================================
  // VIEW: PROGRESS
  // ============================================================
  async function viewProgress() {
    root().innerHTML = shell("/progress", `<div class="center-load"><div class="spinner"></div></div>`);
    wireShell();

    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const { data: logs } = await sb
      .from("ko_sprint_review_logs")
      .select("rating,reviewed_at")
      .eq("user_id", state.user.id)
      .gte("reviewed_at", since)
      .order("reviewed_at", { ascending: false });

    const total = (logs || []).length;
    const correct = (logs || []).filter((l) => l.rating === "good" || l.rating === "easy").length;
    const acc = total ? Math.round((100 * correct) / total) : 0;

    // streak from distinct local days
    const days = new Set((logs || []).map((l) => new Date(l.reviewed_at).toDateString()));
    let streak = 0;
    const d = new Date();
    while (days.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    const todayCount = (logs || []).filter(
      (l) => new Date(l.reviewed_at).toDateString() === new Date().toDateString()
    ).length;

    const hSeen = reviewableHangul().filter(isSeen).length;
    const hMaster = reviewableHangul().filter(isMastered).length;
    const wSeen = state.items.words.filter(isSeen).length;
    const wMaster = state.items.words.filter(isMastered).length;
    const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0) + "%";

    const inner = `
      <div class="card hero" style="padding:16px"><p class="eyebrow">Progress</p><h1 class="h-serif" style="font-size:1.5rem">Your sprint</h1></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${streak}🔥</div><div class="k">Day streak</div></div>
        <div class="stat"><div class="v">${todayCount}</div><div class="k">Today</div></div>
        <div class="stat"><div class="v">${acc}%</div><div class="k">Accuracy</div></div>
      </div>
      <div class="card card-pad" style="display:grid;gap:14px">
        <div class="goal"><span class="k">Hangul mastered</span><span class="v">${hMaster}<small> / 40 · seen ${hSeen}</small></span><div class="bar teal"><i style="width:${pct(hMaster, 40)}"></i></div></div>
        <div class="goal"><span class="k">Words mastered</span><span class="v">${wMaster}<small> / 300 · seen ${wSeen}</small></span><div class="bar"><i style="width:${pct(wMaster, 300)}"></i></div></div>
        <div class="goal"><span class="k">Reviews (30 days)</span><span class="v">${total}</span></div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="v">${dueCount("all")}</div><div class="k">Due now</div></div>
        <div class="stat"><div class="v">${newPool("all").length}</div><div class="k">New left</div></div>
        <div class="stat"><div class="v">${Math.min(viewedCount() * 3, 900)}</div><div class="k">Sent. seen</div></div>
      </div>`;
    root().innerHTML = shell("/progress", inner);
    wireShell();
  }

  // ============================================================
  // START
  // ============================================================
  async function recheckSession() {
    if (state.user) return;
    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user) {
      window.removeEventListener("focus", recheckSession);
      boot(data.session.user);
    }
  }

  async function start() {
    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user) {
      boot(data.session.user);
    } else {
      renderAuth("email");
    }
  }
  start();
})();
