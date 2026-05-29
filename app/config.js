// KO Weekend Sprint — runtime config
// The anon key is public by design; all access is gated by Row Level Security
// + the ko_sprint_allowed_users allowlist. Safe to ship in the client.
window.KO_CONFIG = {
  SUPABASE_URL: "https://ylceljdbapxeynyqphcr.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsY2VsamRiYXB4ZXlueXFwaGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Nzc5MjIsImV4cCI6MjA4ODQ1MzkyMn0.r1JoBx3ZeckpLhWPkLp4z5O2uDNf5zlYv_-8l-4AQJE",
  AUDIO_BASE:
    "https://ylceljdbapxeynyqphcr.supabase.co/storage/v1/object/public/ko-sprint/",
  SPRINT: {
    newHangulPerSession: 10,
    newWordsPerSession: 50,
    targetRetention: 0.9,
    maxDailyReviews: 500,
    goalHangul: 40,
    goalWords: 300,
  },
};
