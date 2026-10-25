import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import mongoose from "mongoose";

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve) => this.ws.addEventListener("open", resolve, { once: true }));
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const task = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) task?.reject(new Error(msg.error.message));
        else task?.resolve(msg.result);
      } else {
        this.handlers.get(msg.method)?.(msg.params);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }
}

async function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await pause(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function captureScreenshot(cdp, filepath) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(filepath, Buffer.from(data, "base64"));
}

async function main() {
  const MONGO_URI = "mongodb://127.0.0.1:27183/aupulens_browser_qa";
  const BASE_URL = "http://localhost:3000";
  const ARTIFACT_DIR = "/home/krrish/.gemini/antigravity-ide/brain/66d4a63e-50ef-456a-979a-f8f7f4d3263f";

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Ensure no customer named Kishore exists before test
  await db.collection("customers").deleteMany({ "header.name": { $regex: /Kishore/i } });
  console.log("Cleaned up existing Kishore customers.");

  console.log("Launching headless Chrome...");
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1280,900",
    "--remote-debugging-port=9229",
  ]);

  try {
    await waitFor(async () => {
      const r = await fetch("http://127.0.0.1:9229/json/version");
      return r.ok;
    }, "Chrome debugger ready", 10000);

    const target = await (await fetch("http://127.0.0.1:9229/json/new?about:blank", { method: "PUT" })).json();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    console.log("1. Navigating to login page...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/auth` });
    await waitFor(() => cdp.evaluate("location.origin === " + JSON.stringify(BASE_URL)), "Auth page load");

    console.log("Logging in via credentials...");
    const loginResult = await cdp.evaluate(`(async () => {
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
        body: new URLSearchParams({
          csrfToken,
          email: 'qa-admin@example.com',
          password: 'Password123!',
          tenantId: 'default'
        })
      });
      return res.status;
    })()`);
    console.log("Login HTTP status:", loginResult);

    console.log("2. Navigating to Sales AI Assistant (/sales/ai-assistant)...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/sales/ai-assistant` });
    await pause(2000);

    // Wait for chat input
    await waitFor(() => cdp.evaluate("!!document.querySelector('textarea')"), "Textarea visible");
    console.log("Sales AI Assistant loaded.");

    // Helper to send message in assistant
    async function sendMessage(text) {
      console.log(`Sending message: "${text}"`);
      await cdp.evaluate(`(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) throw new Error("No textarea found");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, ${JSON.stringify(text)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await pause(600);

      const clicked = await cdp.evaluate(`(() => {
        const textarea = document.querySelector('textarea');
        const form = textarea?.closest('form');
        const btn = form?.querySelector('button[type="submit"]');
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
        if (textarea) {
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
          return true;
        }
        return false;
      })()`);
      console.log("Submit triggered:", clicked);

      // Wait until thinking indicator finishes and new assistant message appears
      await pause(1000);
      await waitFor(async () => {
        const isThinking = await cdp.evaluate("!!document.querySelector('.animate-spin')");
        return !isThinking;
      }, "Assistant finish thinking", 35000);
      await pause(1500);
    }

    // --- TURN 1 ---
    console.log("\n--- Turn 1: Create a new customer named Kishore. ---");
    await sendMessage("Create a new customer named Kishore.");
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/turn1_browser_screenshot.png`);

    const turn1Html = await cdp.evaluate(`document.body.innerText`);
    console.log("Turn 1 Page Text Summary:\n", turn1Html.slice(-1500));

    const custCountTurn1 = await db.collection("customers").countDocuments({ "header.name": { $regex: /Kishore/i } });
    console.log("DB check after Turn 1: customers in DB =", custCountTurn1);
    if (custCountTurn1 !== 0) throw new Error("Premature persistence detected after Turn 1!");

    // --- TURN 2 ---
    console.log("\n--- Turn 2: Multi-turn update with name, type, and phone ---");
    await sendMessage("The customer name is Kishore K, the customer type is Individual, and the phone number is 123456788. Update the existing customer draft with these details. Do not create or save the customer yet.");
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/turn2_browser_screenshot.png`);

    const turn2Html = await cdp.evaluate(`document.body.innerText`);
    console.log("Turn 2 Page Text Summary:\n", turn2Html.slice(-1500));

    if (turn2Html.includes("Phone number \"\" is invalid")) {
      throw new Error("Empty phone error regression detected in Turn 2!");
    }

    const custCountTurn2 = await db.collection("customers").countDocuments({ "header.name": { $regex: /Kishore/i } });
    console.log("DB check after Turn 2: customers in DB =", custCountTurn2);
    if (custCountTurn2 !== 0) throw new Error("Premature persistence detected after Turn 2!");

    // --- TURN 3 ---
    console.log("\n--- Turn 3: Set phone to empty ---");
    await sendMessage("Update the existing customer draft only. Set the name to Kishore K and type to Individual. Leave the phone number empty for now. Do not save or create the customer. Show me the updated draft fields.");
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/turn3_browser_screenshot.png`);

    const turn3Html = await cdp.evaluate(`document.body.innerText`);
    console.log("Turn 3 Page Text Summary:\n", turn3Html.slice(-1500));

    if (turn3Html.includes("Phone number \"\" is invalid")) {
      throw new Error("Empty phone error regression detected in Turn 3!");
    }

    const custCountTurn3 = await db.collection("customers").countDocuments({ "header.name": { $regex: /Kishore/i } });
    console.log("DB check after Turn 3: customers in DB =", custCountTurn3);
    if (custCountTurn3 !== 0) throw new Error("Premature persistence detected after Turn 3!");

    // --- TURN 4 ---
    console.log("\n--- Turn 4: Explicit Confirmation ---");
    await sendMessage("confirm customer");
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/turn4_browser_screenshot.png`);

    const turn4Html = await cdp.evaluate(`document.body.innerText`);
    console.log("Turn 4 Page Text Summary:\n", turn4Html.slice(-1500));

    const finalCustomers = await db.collection("customers").find({ "header.name": { $regex: /Kishore/i } }).toArray();
    console.log("DB check after Turn 4: created customers count =", finalCustomers.length);
    console.log("Customer details:", finalCustomers.map((c) => ({
      _id: c._id,
      name: c.header?.name,
      is_company: c.header?.is_company,
      phone: c.contact_details?.phone,
      tenantId: c.tenantId,
    })));

    if (finalCustomers.length !== 1) {
      throw new Error(`Expected exactly 1 customer, got ${finalCustomers.length}`);
    }

    // --- TURN 5: Duplicate confirmation test ---
    console.log("\n--- Turn 5: Duplicate confirmation (idempotency check) ---");
    await sendMessage("confirm customer");
    await pause(1000);
    const finalCustomersAfterDup = await db.collection("customers").find({ "header.name": { $regex: /Kishore/i } }).toArray();
    console.log("DB check after duplicate confirmation: count =", finalCustomersAfterDup.length);
    if (finalCustomersAfterDup.length !== 1) {
      throw new Error("Duplicate confirmation created an extra customer!");
    }

    console.log("\nAll browser verification steps passed flawlessly!");
  } finally {
    chrome.kill();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("FATAL BROWSER VERIFICATION ERROR:", err);
  process.exit(1);
});
