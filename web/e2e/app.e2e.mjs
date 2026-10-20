/**
 * HodL UI end-to-end test, through the real app and the real Testnet contract.
 *
 *   pnpm dev                 # or pnpm build && pnpm start
 *   pnpm e2e                 # BASE_URL=http://localhost:3000 by default
 *
 * The browser gets a stand-in for the Freighter extension: it answers
 * Freighter's window.postMessage protocol and asks this Node process to sign,
 * so the app's real path runs (wallets kit → Freighter module → tx pipeline)
 * and no secret ever enters the page. Fresh payer and recipient wallets are
 * onboarded through /setup on every run. The faucet step is replaced by a USDC
 * payment from the e2e funder (E2E_PAYER_SECRET in scripts/.env), and the USDC
 * is sent back at the end.
 *
 * Needs Google Chrome installed (CHROME_PATH to override).
 */
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PASSPHRASE = "Test SDF Network ; September 2015";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const SHOTS = path.join(ROOT, "web/e2e/.shots");
const TX_TIMEOUT = 90_000;

const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "scripts/.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const funder = Keypair.fromSecret(process.env.E2E_FUNDER_SECRET ?? env.E2E_PAYER_SECRET);

// ------------------------------------------------------------ reporting

const results = [];
const consoleErrors = [];
const failedRequests = [];
let current = "";

async function step(name, fn) {
  current = name;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message.split("\n")[0] });
    console.log(`  ✖ ${name}\n      ${err.message.split("\n").slice(0, 8).join("\n      ")}`);
    throw err;
  }
}

function check(cond, message) {
  if (!cond) throw new Error(message);
}

// ------------------------------------------------------------ chain helpers

async function usdcOf(address) {
  const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
  if (!res.ok) return null;
  const acc = await res.json();
  const line = acc.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === USDC.issuer);
  return line ? Number(line.balance) : null;
}

async function pay(from, to, amount) {
  const account = await horizon.loadAccount(from.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.payment({ destination: to, asset: USDC, amount: amount.toFixed(7) }))
    .setTimeout(60)
    .build();
  tx.sign(from);
  await horizon.submitTransaction(tx);
}

// ------------------------------------------------------------ the fake Freighter

/** Runs in the page before any app code. */
function freighterStandIn() {
  window.freighter = true;
  window.addEventListener("message", async (ev) => {
    const d = ev.data;
    if (ev.source !== window || d?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
    const reply = (data) =>
      window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: d.messageId, ...data }, window.location.origin);
    const address = await window.__e2eAddress();
    switch (d.type) {
      case "REQUEST_CONNECTION_STATUS":
        return reply({ isConnected: true });
      case "REQUEST_ALLOWED_STATUS":
      case "SET_ALLOWED_STATUS":
        return reply({ isAllowed: true });
      case "REQUEST_ACCESS":
      case "REQUEST_PUBLIC_KEY":
        return reply({ publicKey: address });
      case "REQUEST_NETWORK":
      case "REQUEST_NETWORK_DETAILS": {
        const details = {
          network: "TESTNET",
          networkName: "Test Net",
          networkUrl: "https://horizon-testnet.stellar.org",
          networkPassphrase: "Test SDF Network ; September 2015",
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        };
        return reply({ ...details, networkDetails: details });
      }
      case "SUBMIT_TRANSACTION":
        try {
          const signed = await window.__e2eSign(d.transactionXdr);
          return reply({ signedTransaction: signed, signerAddress: address });
        } catch {
          return reply({ apiError: { code: -4, message: "User declined access" } });
        }
      default:
        return reply({ apiError: { code: -3, message: `e2e stand-in does not support ${d.type}` } });
    }
  });
}

async function walletContext(browser, keypair, { mobile = false } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 1000 } },
  );
  const wallet = { keypair, reject: false, signed: 0 };
  await ctx.exposeFunction("__e2eAddress", () => wallet.keypair.publicKey());
  await ctx.exposeFunction("__e2eSign", (xdr) => {
    if (wallet.reject) throw new Error("rejected");
    const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE);
    tx.sign(wallet.keypair);
    wallet.signed++;
    return tx.toXDR();
  });
  await ctx.addInitScript(freighterStandIn);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push({ step: current, text: m.text().slice(0, 240) });
  });
  page.on("pageerror", (e) => consoleErrors.push({ step: current, text: `pageerror: ${e.message.slice(0, 240)}` }));
  page.on("response", (r) => {
    if (r.status() >= 400) failedRequests.push({ step: current, text: `${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}` });
  });
  return { ctx, page, wallet };
}

// ------------------------------------------------------------ UI helpers

async function connect(page) {
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  // The wallets kit's own picker.
  await page.getByText("Freighter", { exact: true }).first().click();
  // An address like "GAIS…2HWV", not the "Connecting…" label shown while the picker is open.
  await page.getByRole("banner").getByRole("button", { name: WALLET_BUTTON }).waitFor();
}

const WALLET_BUTTON = /G[A-Z2-7]{3}…[A-Z2-7]{4}/;

/** Waits for the transaction toast to succeed, returning its text; throws on an error toast. */
async function txSucceeds(page, successText) {
  const ok = page.getByRole("status").filter({ hasText: successText });
  const bad = page.getByRole("alert").filter({ has: page.locator("button[aria-label='Dismiss']") });
  const winner = await Promise.race([
    ok.waitFor({ timeout: TX_TIMEOUT }).then(() => "ok"),
    bad.waitFor({ timeout: TX_TIMEOUT }).then(() => "bad"),
  ]);
  if (winner === "bad") throw new Error(`Transaction failed: ${(await bad.innerText()).replace(/\s+/g, " ")}`);
  await page.getByRole("status").getByRole("link", { name: /Transaction .* on Stellar Expert/ }).waitFor();
  await page.getByRole("button", { name: "Dismiss" }).click();
}

async function onboard(page, label) {
  await page.goto(`${BASE}/setup`);
  await page.getByRole("heading", { name: /Two minutes/ }).waitFor();
  await connect(page);
  await page.getByRole("button", { name: "Fund with Friendbot" }).click();
  await page.getByText(/XLM\. Plenty for thousands/).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Add USDC to my wallet" }).click();
  await txSucceeds(page, "Done. Your wallet can hold USDC.");
  await page.getByText("USDC trustline added").waitFor({ timeout: 30_000 });
  check((await page.getByRole("progressbar").getAttribute("aria-valuenow")) === "3", `${label}: expected 3/4 checks`);
}

const localDatetime = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function createEscrow(page, { recipient, amount, title, terms, preset = "1 day", customDate, fund = true }) {
  await page.goto(`${BASE}/escrow/new`);
  await page.locator("#amount").fill(String(amount));
  await page.locator("#recipient").fill(recipient);
  await page.getByText("Looks good. This wallet can receive USDC.").waitFor();
  await page.getByRole("button", { name: preset, exact: true }).click();
  if (customDate) await page.locator("#customDate").fill(customDate);
  await page.locator("#title").fill(title);
  await page.locator("#terms").fill(terms);
  if (fund) await page.getByRole("button", { name: `Lock ${amount} USDC` }).click();
  else await page.getByRole("button", { name: "Save it now, lock it later" }).click();
  await txSucceeds(page, fund ? `Locked. ${amount.toFixed(2)} USDC is in the contract.` : "Saved. Lock it whenever you're ready.");
  await page.waitForURL(/\/escrow\/\d+$/);
  return Number(page.url().split("/").pop());
}

const badge = (page) => page.getByRole("region", { name: "Escrow" }).locator("span.rounded-full.border").first();

async function expectBadge(page, text, timeout = 30_000) {
  await badge(page).filter({ hasText: text }).waitFor({ timeout });
}

async function confirmAction(page, open, confirm) {
  await page.getByRole("button", { name: open, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
}

// ------------------------------------------------------------------ run

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const payerKp = Keypair.random();
  const recipientKp = Keypair.random();
  const strangerKp = Keypair.random();
  console.log(`HodL UI e2e against ${BASE}\n  payer     ${payerKp.publicKey()}\n  recipient ${recipientKp.publicKey()}\n`);

  const P = await walletContext(browser, payerKp);
  const R = await walletContext(browser, recipientKp);
  const S = await walletContext(browser, strangerKp);
  let released, refunded, expiring, expiringDeadline;

  try {
    await step("landing renders and links into the app", async () => {
      await P.page.goto(BASE);
      await P.page.getByRole("heading", { name: /Pay strangers/ }).waitFor();
      await P.page.getByRole("banner").getByRole("link", { name: "Open app" }).click();
      await P.page.waitForURL(/\/dashboard$/);
      await P.page.getByRole("heading", { name: /Connect to see/ }).waitFor();
    });

    await step("payer onboards through /setup (connect, Friendbot via API, trustline)", () => onboard(P.page, "payer"));
    await step("recipient onboards through /setup", () => onboard(R.page, "recipient"));

    await step("payer gets 6 test USDC (stands in for Circle's faucet); setup completes", async () => {
      await pay(funder, payerKp.publicKey(), 6);
      await P.page.getByText(/6\.00 USDC ready to lock/).waitFor({ timeout: 40_000 });
      await P.page.getByRole("link", { name: "Start your first escrow" }).waitFor();
    });

    await step("new-escrow form validates: bad address, own address, too much, missing title", async () => {
      const p = P.page;
      await p.goto(`${BASE}/escrow/new`);
      await p.locator("#recipient").fill("GNOTANADDRESS");
      await p.locator("#title").click();
      await p.getByText("That isn't a Stellar address.", { exact: false }).waitFor();
      await p.locator("#recipient").fill(payerKp.publicKey());
      await p.getByText("That's your own wallet.", { exact: false }).waitFor();
      await p.locator("#amount").fill("999");
      await p.getByText("That's more USDC than your wallet holds.").waitFor();
      check(await p.getByRole("button", { name: "Lock 999 USDC" }).isDisabled(), "Lock should be disabled above the balance");
      await p.locator("#amount").fill("1");
      await p.locator("#recipient").fill(recipientKp.publicKey());
      await p.getByRole("button", { name: "Lock 1 USDC" }).click();
      await p.getByText("Give it a short title.").waitFor();
      check(P.wallet.signed === 1, "Nothing should have been signed for an invalid form");
    });

    await step("wallet rejection: nothing is created, friendly message", async () => {
      P.wallet.reject = true;
      const p = P.page;
      await p.locator("#title").fill("Should never exist");
      await p.getByRole("button", { name: "Lock 1 USDC" }).click();
      await p.getByRole("alert").filter({ hasText: "Cancelled in your wallet" }).waitFor({ timeout: TX_TIMEOUT });
      check(p.url().endsWith("/escrow/new"), "Should stay on the form");
      P.wallet.reject = false;
      await p.getByRole("button", { name: "Dismiss" }).click();
    });

    await step("expiry escrow: lock with a custom deadline ~3 minutes out", async () => {
      const d = new Date(Date.now() + 3 * 60_000);
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() + 1);
      expiringDeadline = d.getTime();
      expiring = await createEscrow(P.page, {
        recipient: recipientKp.publicKey(),
        amount: 2,
        title: "E2E expiry",
        terms: "Deadline passes before release.",
        preset: "Pick a date",
        customDate: localDatetime(d),
      });
      await expectBadge(P.page, "Locked");
    });

    await step("release: create & lock, recipient sees it locked, payer releases", async () => {
      const before = await usdcOf(recipientKp.publicKey());
      released = await createEscrow(P.page, { recipient: recipientKp.publicKey(), amount: 2, title: "E2E release", terms: "Logo, two rounds." });
      const p = P.page;
      await expectBadge(p, "Locked");
      await p.getByText("LOCKED IN CONTRACT").waitFor();
      await p.getByRole("region", { name: "Escrow" }).getByText("2.00", { exact: true }).waitFor();
      await p.getByRole("heading", { name: /Got what you/ }).waitFor();
      const receipts = p.getByRole("region", { name: "Receipts" }).or(p.locator("section[aria-labelledby='receipts']"));
      await receipts.getByText("2.00 USDC locked").waitFor({ timeout: 30_000 });
      await receipts.getByText("Escrow created").waitFor();

      await R.page.goto(`${BASE}/escrow/${released}`);
      await R.page.getByRole("heading", { name: /It's locked/ }).waitFor();
      await R.page.getByText("Your wallet is ready to receive USDC").first().waitFor();

      await confirmAction(p, "Release 2 USDC", "Release 2 USDC");
      await txSucceeds(p, "Paid. 2.00 USDC sent.");
      await expectBadge(p, "Released");
      await p.getByRole("heading", { name: "Paid in full." }).waitFor();
      check((await usdcOf(recipientKp.publicKey())) === before + 2, "Recipient should be +2 USDC");
      // The recipient's open page catches up by polling.
      await expectBadge(R.page, "Released", 25_000);
      check(!(await p.getByRole("button", { name: "Release 2 USDC" }).count()), "No release button once released");
    });

    await step("refund: save first, lock later from the detail page, recipient refunds", async () => {
      refunded = await createEscrow(P.page, {
        recipient: recipientKp.publicKey(),
        amount: 2,
        title: "E2E refund",
        terms: "Recipient backs out.",
        fund: false,
      });
      const p = P.page;
      await expectBadge(p, "Not funded yet");
      await p.getByRole("heading", { name: /Lock it to/ }).waitFor();
      await p.getByRole("button", { name: "Lock 2 USDC" }).click();
      await txSucceeds(p, "Locked. 2.00 USDC is in the contract.");
      await expectBadge(p, "Locked");

      const payerBefore = await usdcOf(payerKp.publicKey());
      await R.page.goto(`${BASE}/escrow/${refunded}`);
      await confirmAction(R.page, "Refund the payer", "Refund the payer");
      await txSucceeds(R.page, "Refunded. 2.00 USDC went back.");
      await expectBadge(R.page, "Refunded");
      check((await usdcOf(payerKp.publicKey())) === payerBefore + 2, "Payer should be +2 USDC after the refund");
      await expectBadge(p, "Refunded", 25_000);
    });

    await step("a stranger sees it read-only, with and without a wallet", async () => {
      await S.page.goto(`${BASE}/escrow/${expiring}`);
      await S.page.getByRole("heading", { name: /Is this/ }).waitFor();
      await connect(S.page);
      await S.page.getByRole("heading", { name: /just looking/ }).waitFor();
      check(!(await S.page.getByRole("button", { name: /Release|Refund|Take back|Lock/ }).count()), "Stranger must see no actions");
    });

    await step("dashboard: totals, waiting-on-you, tabs and rows", async () => {
      const p = P.page;
      await p.goto(`${BASE}/dashboard`);
      await p.getByRole("heading", { name: /Your escrows/ }).waitFor();
      await p.getByRole("tab", { name: "All · 3" }).waitFor({ timeout: 30_000 });
      await p.getByRole("tab", { name: "Settled · 2" }).click();
      await p.getByRole("link", { name: /E2E release/ }).waitFor();
      await p.getByRole("link", { name: /E2E refund/ }).waitFor();
      // Rows leaving the list animate out first; wait for that, then check.
      await p.getByRole("link", { name: /E2E expiry/ }).waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      check(!(await p.getByRole("link", { name: /E2E expiry/ }).count()), "Expiry escrow isn't settled yet");
      await p.getByRole("tab", { name: "All · 3" }).click();
      await p.getByRole("link", { name: /E2E expiry/ }).waitFor();
      await p.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
    });

    await step("expiry: payer can't reclaim early, then takes it back after the deadline", async () => {
      const p = P.page;
      await p.goto(`${BASE}/escrow/${expiring}`);
      await p.getByRole("heading", { name: /Got what you/ }).waitFor();
      check(!(await p.getByRole("button", { name: "Take back 2 USDC" }).count()), "No take-back before the deadline");
      const wait = expiringDeadline - Date.now() + 8_000;
      if (wait > 0) {
        console.log(`      waiting ${Math.round(wait / 1000)}s for the deadline…`);
        await p.waitForTimeout(wait);
      }
      // Flips on its own: the phase is derived from the clock.
      await expectBadge(p, "Deadline passed", 20_000);
      const before = await usdcOf(payerKp.publicKey());
      await confirmAction(p, "Take back 2 USDC", "Take back 2 USDC");
      await txSucceeds(p, "Back with you. 2.00 USDC returned.");
      await expectBadge(p, "Returned");
      await p.getByRole("heading", { name: "Back where it started." }).waitFor();
      check((await usdcOf(payerKp.publicKey())) === before + 2, "Payer should be +2 USDC after taking it back");
    });

    await step("activity lists every receipt with hashes", async () => {
      const p = P.page;
      await p.goto(`${BASE}/activity`);
      await p.getByRole("heading", { name: /Every receipt/ }).waitFor();
      for (const label of ["Released", "Refunded", "Returned"]) await p.locator("li", { hasText: label }).first().waitFor({ timeout: 30_000 });
      const hashes = await p.getByRole("link", { name: /Transaction .* on Stellar Expert/ }).count();
      check(hashes >= 8, `Expected ≥ 8 receipts, saw ${hashes}`);
    });

    await step("mobile: sticky action bar locks funds from a phone", async () => {
      const M = await walletContext(browser, payerKp, { mobile: true });
      try {
        const id = await (async () => {
          await M.page.goto(`${BASE}/escrow/new`);
          await connect(M.page);
          return createEscrow(M.page, { recipient: recipientKp.publicKey(), amount: 1, title: "E2E mobile", terms: "From a phone.", fund: false });
        })();
        const sticky = M.page.locator("div.fixed.bottom-0").getByRole("button", { name: "Lock 1 USDC" });
        await sticky.waitFor();
        await M.page.screenshot({ path: `${SHOTS}/mobile-escrow.png` });
        await sticky.click();
        await txSucceeds(M.page, "Locked. 1.00 USDC is in the contract.");
        await expectBadge(M.page, "Locked");
        const width = await M.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        check(width[0] <= width[1], `Horizontal scroll on mobile: ${width}`);
        // Leave nothing locked: release it through the sticky bar too.
        await M.page.locator("div.fixed.bottom-0").getByRole("button", { name: "Release 1 USDC" }).click();
        await M.page.getByRole("dialog").getByRole("button", { name: "Release 1 USDC" }).click();
        await txSucceeds(M.page, "Paid. 1.00 USDC sent.");
        await expectBadge(M.page, "Released");
        console.log(`      escrow #${id}`);
      } catch (err) {
        await M.page.screenshot({ path: `${SHOTS}/failure-mobile.png`, fullPage: true }).catch(() => {});
        throw err;
      } finally {
        await M.ctx.close();
      }
    });

    await step("disconnect returns to the connect prompt", async () => {
      const p = P.page;
      await p.goto(`${BASE}/dashboard`);
      await p.getByRole("banner").getByRole("button", { name: WALLET_BUTTON }).click();
      await p.getByRole("menuitem", { name: "Disconnect" }).click();
      await p.getByRole("heading", { name: /Connect to see/ }).waitFor();
    });
  } catch {
    await P.page.screenshot({ path: `${SHOTS}/failure-payer.png`, fullPage: true }).catch(() => {});
    await R.page.screenshot({ path: `${SHOTS}/failure-recipient.png`, fullPage: true }).catch(() => {});
  } finally {
    // Send the test USDC back to the funder.
    for (const kp of [payerKp, recipientKp]) {
      const bal = await usdcOf(kp.publicKey()).catch(() => null);
      if (bal) await pay(kp, funder.publicKey(), bal).catch((e) => console.log(`  (couldn't return USDC: ${e.message})`));
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed. Escrows: release #${released}, refund #${refunded}, expiry #${expiring}`);
  const realErrors = consoleErrors.filter((e) => !/Download the React DevTools/.test(e.text));
  console.log(realErrors.length ? `\nBrowser console errors (${realErrors.length}):` : "\nNo browser console errors.");
  for (const e of realErrors.slice(0, 15)) console.log(`  [${e.step}] ${e.text}`);
  if (failedRequests.length) console.log(`\nNon-2xx responses (${failedRequests.length}):`);
  for (const e of failedRequests.slice(0, 15)) console.log(`  [${e.step}] ${e.text}`);
  process.exit(failed.length || realErrors.length ? 1 : 0);
}

main();
