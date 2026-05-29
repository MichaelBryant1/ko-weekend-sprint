// FSRS-6 scheduler (Free Spaced Repetition Scheduler).
// Clean client-side implementation with the published FSRS-6 default weights.
// Ratings: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
// State machine kept simple for a weekend sprint: new -> learning -> review,
// with short "learning steps" for Again/Hard so lapses re-surface quickly.

(function () {
  const W = [
    0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261,
    0.112, 1.0178, 1.849, 0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536,
    0.3332, 0.1437, 0.2,
  ];
  const DECAY = -W[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  const MIN_S = 0.01;
  const MAX_S = 36500; // 100 years in days
  const DAY_MS = 86400000;

  const clampD = (d) => Math.min(Math.max(d, 1), 10);
  const clampS = (s) => Math.min(Math.max(s, MIN_S), MAX_S);

  // Retrievability after `t` days at stability `s`.
  function retrievability(t, s) {
    if (s <= 0) return 0;
    return Math.pow(1 + (FACTOR * t) / s, DECAY);
  }

  // Days until retrievability decays to the desired retention.
  function intervalDays(s, retention) {
    const i = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
    return Math.max(1, Math.round(i));
  }

  function initStability(g) {
    return clampS(W[g - 1]);
  }
  function initDifficulty(g) {
    return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
  }
  function nextDifficulty(d, g) {
    const deltaD = -W[6] * (g - 3);
    const dampened = d + deltaD * ((10 - d) / 9); // linear damping
    const reverted = W[7] * initDifficulty(4) + (1 - W[7]) * dampened; // mean reversion
    return clampD(reverted);
  }
  function stabilityAfterRecall(d, s, r, g) {
    const hard = g === 2 ? W[15] : 1;
    const easy = g === 4 ? W[16] : 1;
    const inc =
      Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) *
      hard *
      easy;
    return clampS(s * (1 + inc));
  }
  function stabilityAfterForget(d, s, r) {
    const sForget =
      W[11] *
      Math.pow(d, -W[12]) *
      (Math.pow(s + 1, W[13]) - 1) *
      Math.exp(W[14] * (1 - r));
    // Post-lapse stability never exceeds the pre-lapse value.
    return clampS(Math.min(sForget, s));
  }

  // Learning steps (minutes) used while a card has not yet graduated to review.
  const LEARN_STEPS_MIN = [1, 10];
  const RETENTION = () =>
    (window.KO_CONFIG && window.KO_CONFIG.SPRINT.targetRetention) || 0.9;

  // card: {state, stability, difficulty, due, last_review, reps, lapses}
  // now: Date. Returns the FOUR possible outcomes so the UI can preview them.
  function schedule(card, now) {
    now = now || new Date();
    const elapsed =
      card.last_review && card.state === "review"
        ? Math.max(0, (now - new Date(card.last_review)) / DAY_MS)
        : 0;

    const outcomes = {};
    for (let g = 1; g <= 4; g++) {
      outcomes[g] = computeOutcome(card, g, elapsed, now);
    }
    return outcomes;
  }

  function computeOutcome(card, g, elapsed, now) {
    let state = card.state || "new";
    let stability = card.stability;
    let difficulty = card.difficulty;
    let reps = (card.reps || 0) + 1;
    let lapses = card.lapses || 0;
    let dueMs;

    if (state === "new") {
      stability = initStability(g);
      difficulty = initDifficulty(g);
      if (g === 1) {
        state = "learning";
        dueMs = now.getTime() + LEARN_STEPS_MIN[0] * 60000;
      } else if (g === 2) {
        state = "learning";
        dueMs = now.getTime() + LEARN_STEPS_MIN[1] * 60000;
      } else {
        state = "review";
        const days = g === 4 ? intervalDays(stability, RETENTION()) : 1;
        dueMs = now.getTime() + Math.max(1, days) * DAY_MS;
      }
    } else if (state === "learning" || state === "relearning") {
      if (g === 1) {
        dueMs = now.getTime() + LEARN_STEPS_MIN[0] * 60000;
      } else if (g === 2) {
        dueMs = now.getTime() + LEARN_STEPS_MIN[1] * 60000;
      } else {
        // graduate
        state = "review";
        stability = stability || initStability(g);
        const days = intervalDays(stability, RETENTION());
        dueMs = now.getTime() + days * DAY_MS;
      }
    } else {
      // review
      const r = retrievability(elapsed, stability);
      difficulty = nextDifficulty(difficulty, g);
      if (g === 1) {
        lapses += 1;
        stability = stabilityAfterForget(difficulty, stability, r);
        state = "relearning";
        dueMs = now.getTime() + LEARN_STEPS_MIN[0] * 60000;
      } else {
        stability = stabilityAfterRecall(difficulty, stability, r, g);
        const days = intervalDays(stability, RETENTION());
        dueMs = now.getTime() + days * DAY_MS;
      }
    }

    return {
      rating: g,
      state,
      stability,
      difficulty,
      reps,
      lapses,
      due: new Date(dueMs).toISOString(),
      last_review: now.toISOString(),
      // human-friendly label for the rating button
      label: humanInterval(dueMs - now.getTime()),
    };
  }

  function humanInterval(ms) {
    const min = ms / 60000;
    if (min < 60) return `${Math.round(min)}m`;
    const hr = min / 60;
    if (hr < 24) return `${Math.round(hr)}h`;
    const d = hr / 24;
    if (d < 30) return `${Math.round(d)}d`;
    const mo = d / 30;
    if (mo < 12) return `${Math.round(mo)}mo`;
    return `${(d / 365).toFixed(1)}y`;
  }

  // Fresh card skeleton for a brand-new (item, direction).
  function newCard() {
    return {
      state: "new",
      stability: null,
      difficulty: null,
      due: null,
      last_review: null,
      reps: 0,
      lapses: 0,
    };
  }

  window.FSRS = { schedule, newCard, retrievability, humanInterval };
})();
