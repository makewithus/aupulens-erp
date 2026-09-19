import { vi } from "vitest";
import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { handleTaskFlow, type TaskFlowDeps, type TaskFlowResponse } from "@/lib/ai/taskFlow/handler";
import type { FlowState, Lookups } from "@/lib/ai/taskFlow/engine";
import type { CustomerLite } from "@/lib/ai/taskFlow/parse";

import { clearLanguageCache } from "@/lib/ai/language/pipeline";
import { clearReplyCache } from "@/lib/ai/language/respond";
import { fakeClient, setSarvamEnv } from "../language/helpers";

export const NOW = new Date("2026-09-19T06:00:00Z"); // Saturday 19 Sep 2026 (IST)

export const CUSTOMERS: CustomerLite[] = [
  { id: "c1", name: "Acme Trading", aliases: ["Acme Trading"] },
  { id: "c2", name: "Acme Industries", aliases: ["Acme Industries"] },
  { id: "c3", name: "Kanchipuram Silks Pvt Ltd", aliases: ["Kanchipuram Silks Pvt Ltd"] },
  { id: "c4", name: "Kamal", aliases: ["Kamal"] },
  { id: "c5", name: "Invoce Traders", aliases: ["Invoce Traders"] },
];

/** Mock translator: word-level, keeps ZXQ placeholders and digits, like a well-behaved provider. */
export const RULES: [RegExp, string][] = [
  [/invoice podunga|இன்வாய்ஸ் போடுங்க/gi, "create an invoice"],
  [/mujhe invoice banana hai/gi, "create an invoice"],
  [/(\S+) ke liye invoice banao/gi, "create an invoice for $1"],
  [/(\S+) ke liye/gi, "for $1"],
  [/agle mangalwar/gi, "next Tuesday"],
  [/\bhaan\b|ஆம்/gi, "yes"],
  [/रद्द करो|ரத்து/gi, "cancel"],
  [/नहीं/gi, "no"],
];
export const translator = (req: any) => ({ text: RULES.reduce((s, [rx, to]) => s.replace(rx, to), req.input) });

export interface Harness {
  say(text: string, extra?: { expectSession?: boolean }): Promise<TaskFlowResponse>;
  store: { session: { id: string; state: FlowState } | null; closed: { id: string; status: string; ref?: string }[]; charged: number };
  client: ReturnType<typeof fakeClient>;
  posts: { url: string; body: any; cookie: string }[];
  clock: { now: Date };
  classifySpy: ReturnType<typeof vi.fn>;
}

export function makeHarness(o: {
  customers?: CustomerLite[]; role?: string; autoCreate?: boolean; last?: CustomerLite | null;
  translate?: (req: any) => any; classify?: (english: string) => Promise<any>; recentItems?: string[] | (() => Promise<string[]>); postResponse?: { status: number; json: any }; lookupThrows?: Error; multilingualDisabled?: boolean;
} = {}): Harness {
  setSarvamEnv(true);
  clearLanguageCache(); clearReplyCache();
  const client = fakeClient(o.translate ?? translator);
  setSarvamClientForTests(client);
  const customers = o.customers ?? CUSTOMERS;
  const store: Harness["store"] = { session: null, closed: [], charged: 0 };
  const clock = { now: new Date(NOW) };
  const posts: Harness["posts"] = [];
  let seq = 0;

  const lookups: Lookups = {
    async customerCount() { if (o.lookupThrows) throw o.lookupThrows; return customers.length; },
    async findCustomers(q) {
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      return customers.filter((c) => words.some((w) => c.name.toLowerCase().includes(w)));
    },
    async recentItems() { return typeof o.recentItems === "function" ? o.recentItems() : (o.recentItems ?? []); },
    async lastCustomer() { return o.last === undefined ? customers[0] : o.last; },
  };
  const deps: TaskFlowDeps = {
    lookups,
    now: () => clock.now,
    loadSession: async () => (store.session && !store.closed.some((c) => c.id === store.session!.id) ? store.session : null),
    saveSession: async (_t, _u, _m, state, id) => {
      const sid = id ?? `s${++seq}`;
      store.session = { id: sid, state: JSON.parse(JSON.stringify(state)) }; // persisted as JSON, like Mongo
      return sid;
    },
    closeSession: async (_t, id, status, ref) => { store.closed.push({ id, status, ref }); if (store.session?.id === id) store.session = null; },
    aiAllowed: async () => true,
    chargeTranslation: async () => { store.charged++; },
  };
  const fetchFn = vi.fn(async (url: string, init: any) => {
    posts.push({ url, body: JSON.parse(init.body), cookie: init.headers.cookie });
    const r = o.postResponse ?? { status: 201, json: { success: true, data: { _id: "inv123" } } };
    return { status: r.status, json: async () => r.json } as any;
  });

  const classifySpy = vi.fn(async (_t: string, e: string) => (o.classify ? o.classify(e) : null));
  (deps as any).classify = classifySpy;
  return {
    store, client, posts, clock, classifySpy,
    say: (text, extra) => handleTaskFlow(
      { tenantId: "t1", userId: "u1", role: o.role ?? "sales", text, expectSession: extra?.expectSession, aiSettings: { autoCreateEnabled: o.autoCreate, multilingualDisabled: o.multilingualDisabled }, http: { origin: "http://x", cookie: "session=abc", fetchFn: fetchFn as any } },
      deps,
    ),
  };
}

