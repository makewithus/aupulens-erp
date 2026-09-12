# AUPULENS — GLOBAL ADMIN, PHASE 9 ADDENDUM B
# Read alongside `BRIEF-PHASE-9-COVERAGE.md` and `BRIEF-PHASE-9a-ADDENDUM.md`.

> Report 2a accepted. Group A is the strongest work in this phase, and the latent STARTER bug you
> surfaced while doing it — the catalogue omitting `inventory`, which would have wrongly blocked a
> STARTER tenant on the one route wired to `enforce.ts` — is exactly why the decision was to make
> the two definitions match rather than to assume they already did. `moduleGate.test.ts` passing
> with zero edits is the proof that matters.
>
> Save this to `docs/admin/BRIEF-PHASE-9b-ADDENDUM.md`.

---

# PART 0 — THE SOURCE SPECIFICATION HAS ARRIVED

You were right twice: it was never in the repo, and it did not arrive with Addendum A.

**`SOURCE-SPEC.md` is supplied with this addendum — the complete CTO document, §1 through §33
plus the summary.** Do this first, before any Group B work:

1. Save it verbatim to `docs/admin/SOURCE-SPEC.md` and commit it.
2. Commit this addendum and the two prior Phase 9 briefs alongside it. The gap you found — a
   project measured against a document nobody can open — closes permanently here.
3. **Re-run `COVERAGE_MATRIX.md` against the full text.** Expect movement; some requirements were
   never quoted in nine phases and could not have been in your fragment-based matrix.

Specific things in the full text your fragments may not have carried, worth checking against what
you have built:

- **§5** names the exact create-organisation fields: Legal Name, Display Name, Organisation Type,
  Country, Currency, Timezone, Tax Jurisdiction, Primary Contact, Email, Phone, Subscription Plan —
  and separately requires Organisation ID, Tenant ID, Created At, Created By, Initial Status to be
  system-generated. Check your create form against that list field by field.
- **§13** lists thirteen dashboard metrics, including **Top Models**, **Failed Requests** and
  **Average Request Cost**, which are easy to miss.
- **§20** gives the four organisation-type log profiles their literal category lists.
- **§28** gives ten alert conditions by name — including **AI cost spike**, **mass data export**,
  **repeated permission failures** and **system error spike**. Check which of the ten you actually
  detect.
- **§31** names `organisation_settings`, `roles`, `permissions`, `user_roles` alongside the models
  you built.

Report what moved. A matrix that shifts after seeing the real document is a matrix doing its job.

---

# PART 1 — `PLAN_KEY` IS A FIXED ENUM: DECIDED

You flagged that `PLAN_KEY` is seven fixed values, so "create a plan" has no meaning beyond editing
or activating one of seven seeded slots — and you flagged it rather than faking a create button.
Correct call.

**Keep the enum. Do not make plan keys free-form.**

The specification supports this reading. §8 says "Global Admin must be able to **manage**
subscription plans" and gives the seven as the plan set. §11's requirement — "create a custom plan
for enterprise customers" — is satisfied by `CUSTOM` as the base plan plus the
`OrganizationEntitlement` override layer you shipped in Group A item 3. An enterprise customer on
`CUSTOM` with unlimited users, 25 companies and a bespoke module set *is* a custom plan, and it is
per-organisation, which is what §11's worked example actually describes.

Free-form plan keys would mean an unbounded enum flowing into `moduleGate`, the resolver, the
bridge and every test that switches on it — real risk for a naming convenience.

**What to do:**
- Document this resolution in `COVERAGE_MATRIX.md` against §8 and §11, in one line each, so nobody
  re-opens it.
- On the `/platform/plans` page, make it visible: the seven slots, which are active, and a short
  note that per-customer variation is done through a `CUSTOM` assignment plus overrides. An
  operator should not have to guess where "create a plan" went.
- Make sure the `CUSTOM` slot is genuinely usable as a base — assignable, with sensible neutral
  defaults, so the override editor has something coherent to sit on.

The org-impact count with the explicit confirmation checkbox before saving a plan edit is a good
piece of design. That is the control that stops someone changing STARTER at 6pm and altering every
STARTER tenant at once.

---

# PART 2 — CONTINUE: GROUPS B, C, D

Unchanged from Addendum A. Order stands, with the §13 and §28 additions from Part 0 folded in.

**Group B — AI configuration (§14, §15, §16)**
- AI limit editor: monthly credits, daily credits, max requests, max tokens, max cost, plus the
  at-limit behaviour selector. Gated `CONFIGURE_AI_LIMITS` — `AI_ADMIN` and `GLOBAL_SUPER_ADMIN`
  only. **Test that a `GLOBAL_ADMIN` session is refused**; it is the cleanest live proof of the
  corrected matrix.
- Overage controls: enabled, rate, soft limit, hard limit, alert thresholds.
- §13's thirteen dashboard metrics, in full.
- §14's feature breakdown: instrument `lib/docIntel/` if it is genuinely small, otherwise leave the
  two buckets as declared honest zeros. Do not half-instrument.

**Group C — Surfaces (§3, §7, §24, §18)**
- §3 list: Organisation ID, Region, Usage %, and the **resolved plan** rather than the legacy tier
  label. After Group A's bridge, list and detail must agree — a mismatch here would be found in
  QA's first ten minutes.
- §7: the four remaining tabs, plus Storage and Monthly Revenue as labelled, explained empty states.
- §24: every KPI real data supports; the rest as explained empty tiles, never absent tiles. All six
  operational panels.
- §18: every filter the data supports; state in the UI which are unavailable and why.
- §28: check all ten alert conditions; implement what the data supports, declare the rest.

**Group D — Security and logs (§25, §21, §31, §33)**
- §25: IP/device visibility and privileged-action confirmation on delete organisation, manage
  global admins, and security configuration. You have the confirmation pattern already from the
  plan editor — reuse it.
- §31: build `PlatformSystemLog` / `PlatformSecurityLog`, or document that `PlatformAuditLog`
  covers both via severity-filtered views. Decide and record.
- Whatever else the re-run matrix surfaces.

**After each group:** run `noStaticData.test.ts` and the relevant existing test files. Not once at
the end — in the commit that introduced the change.

---

# PART 3 — STILL OUTSTANDING FROM THE PHASE 9 BRIEF

Do not let these slip behind the build work. All four are release gates.

- **Part 4** — the three AI-runtime test failures (`ai07AccrualIntelligence`,
  `ai21StatementIntelligenceEdgeCases`, `ai29ControlMonitoringEdgeCases`). Diagnose, root-cause
  against `git log` between 2026-09-03 and 2026-09-09, fix in separately-labelled commits, report
  separately. These are the workflows being demoed.
- **Part 5** — the full targeted UI regression scan, which no phase of this project has yet run,
  plus the route-by-route API surface diff.
- **Part 3.2** — the integration seam proofs, including the `vercel.json` cron discrepancy.
- **Part 6** — every QA case re-run in a real browser, SELFRUN updated to say "browser", and the
  document extended to cover everything Groups A–D add.

---

# PART 4 — REPORTING

**Report 2b — after the matrix re-run and Group B.** Lead with what the full specification changed
in the matrix. Then Group B, including the `GLOBAL_ADMIN`-refused-on-AI-limits test result.

**Report 2c — after Groups C and D, and Part 4's AI diagnosis.**

**Report 3 — final.** The Phase 9 stop gate with evidence, the browser SELFRUN summary, the UI scan
and API diff, and an explicit list of anything still open.

---

One thing worth saying, since the finish line is close. The value of this build is not that it is
feature-complete — it is that its documentation tells the truth, including the parts that are not
done. The `MISSING` and `DECLARED_NOT_POSSIBLE` rows, the one-of-424 note, the inferred matrix you
flagged rather than asserted, the STARTER bug you found by checking instead of wiring. Keep that
standard through Groups B to D. A coverage matrix with honest gaps is worth more to the people
about to test this, and to the people about to be pitched, than a green one nobody can verify.
