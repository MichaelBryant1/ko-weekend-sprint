import { createRequire } from "module";
const require = createRequire("C:/Users/Micha/Downloads/bonkish-cavern-run/node_modules/index.js");
const { chromium, devices } = require("playwright");

const URL = "https://bryantanalytics.com/ko-weekend-sprint/";
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 12"] });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

const hasLogo = await page.locator(".auth-card .logo").count();
const hasEmail = await page.locator("#email").count();
const hasBtn = await page.getByText("Email me a sign-in link").count();
const sbType = await page.evaluate(() => typeof window.supabase);
const cfgOk = await page.evaluate(() => !!(window.KO_CONFIG && window.KO_CONFIG.SUPABASE_URL));
const fsrsOk = await page.evaluate(() => !!(window.FSRS && window.FSRS.schedule));
// exercise FSRS in-page to confirm no math errors
const fsrsDemo = await page.evaluate(() => {
  const c = window.FSRS.newCard();
  const o = window.FSRS.schedule(c, new Date());
  return { again: o[1].label, good: o[3].label, easy: o[4].label, easyState: o[4].state };
});

await page.screenshot({ path: "scripts/qa_screen.png", fullPage: true });

console.log("auth logo present :", hasLogo > 0);
console.log("email input       :", hasEmail > 0);
console.log("send button       :", hasBtn > 0);
console.log("window.supabase   :", sbType);
console.log("KO_CONFIG loaded  :", cfgOk);
console.log("FSRS loaded       :", fsrsOk);
console.log("FSRS demo (new card grades):", JSON.stringify(fsrsDemo));
console.log("JS errors         :", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
