# Phase 11 working checklist

> Source: `docs/admin/BRIEF-PHASE-11-CLOSEOUT.md` Part 8, built as the first action per the
> brief's instruction, worked in order. Updated as work proceeds.

```
SUPPLIED TEXT (Part 0)
[x] §7's four missing tabs identified: Modules, Configuration, Security, Usage
[x] HARD_RULES.md: all 15 rules, proof + test each; rule 12 checked hardest — found genuinely
    broken (every timestamp display used the browser's local zone, unlabeled), fixed with a
    shared formatInOrgTimezone()/formatPlatformTimestamp() utility, new test suite
[x] ORGANIZATION_STATUS confirmed as exactly the 8 values, all reachable through the UI;
    PAYMENT_HOLD was a label that lied (reachable, persisted, zero effect) — now blocks login
    the same way SUSPENDED does

CLOSE THE PARTIALS (Part 1)
[x] §3 list: Organisation ID, Region, Usage % (null-safe), resolved plan not legacy tier
[x] §7: Modules tab — reads resolveEntitlements()+the plan's own module set, shows plan vs
    override vs effective distinctly; edits route through the existing setOverride()/
    entitlement-override endpoint, no new write path
[x] §7: Configuration tab — country/currency/timezone/taxJurisdiction, editable, audited;
    changing country warns rather than silently re-deriving currency/timezone (a real Mongoose
    bug in the first pass — wholesale settings reassignment dropped nested sub-objects — caught
    by the new test suite before shipping, fixed with Object.assign + markModified)
[x] §7: Security tab — real tenant user list + status; MFA/recent-logins/failed-logins/active-
    sessions each individually named as unavailable with a specific reason (checked directly:
    none of these fields/logs exist for tenant users in this codebase)
[x] §7: Usage tab — real user-count-vs-plan-limit (null-safe); storage/API/document counts each
    individually named as unavailable with a specific reason (same per-org verification as the
    platform-wide Storage Used finding)
[x] §7: Overview gains Storage + Monthly Revenue as explained empty states (each with its own
    specific reason on hover, matching the per-field pattern used on the new Security/Usage tabs)
[x] §18: 4 of 7 filters real (Date, User, IP, Device — checked directly against ActivityLog's
    schema rather than assumed from its own "free text" framing: ipAddress/userAgent/userId are
    real, populated fields the matrix undersold); Action/Module/Severity disabled with a reason
[ ] §21/§31: security log view decided, built, recorded in DECISIONS.md
[ ] §24: 14 real KPIs built; 4 as explained empty tiles
[ ] §24: all six operational panels
[ ] §25: Admin Sessions view with IP/device and new-IP flag
[ ] §25: privileged-action confirmation on the three named actions
[ ] §28: export audit signal + alert (7 of 10)
[ ] §26: SUPPORT_ADMIN gate verified over real HTTP
[ ] §19: ActivityLog isolation proven by source-grep

QUALITY (Parts 2-4)
[ ] Theme matched to existing modules; no parallel styling
[ ] Every screen: loading, empty, error, populated
[ ] Usability checklist 2.3 applied to every new surface
[ ] Sidebar reorganised to the §2 hierarchy
[ ] Performance measured at 500+ orgs / 100k+ audit rows; every budget met or fixed
[ ] Full edge-case matrix per surface, including the adversarial question
[ ] All seven roles against every new screen

VERIFY & RELEASE (Parts 5-7)
[ ] Matrix gains a separate "Verified working" column; every row filled
[ ] Phase 10 Part 3 sweep complete; every failure fixed
[ ] Nine cross-phase integration checks
[ ] All release gates in Part 6
[ ] QA document extended; every case re-run in a browser
[ ] Known limits in plain English
[ ] Final readiness statement
```

## Report gates (per the brief)
- [ ] Part 1 complete
- [ ] Parts 2-4 complete
- [ ] Part 5 complete
- [ ] Final
