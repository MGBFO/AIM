# User Acceptance Testing (UAT) — Analysis in Motion

For a **non-technical tester**. You need only a browser and the app link your
team deployed (see README → "Get a shareable app link"). No install, no login in
demo mode. Your job: use the app like an analyst and report anything that looks
wrong, confusing, or missing.

> **Scope of this checklist:** the *user experience* — layout, data, workflows,
> wording. Shared multi-user data, permissions, and live sync between people are
> **backend features tested separately by a technical reviewer** (see
> `docs/DEPLOY.md` §0/§0b). In demo mode your edits save only in *your* browser.

## How to report an issue
For each problem note: **which module**, **what you did**, **what you expected**,
**what happened**, and a screenshot if possible.

## Walkthrough

**Dashboard**
- [ ] Loads with summary panels (recent/upcoming trips, monitoring quarter table,
      PRC next meeting) filled with sample data.
- [ ] Under **Useful Links**, add a link → it appears; **Show/Hide** reveals the
      password; **Open ↗** opens it in a new tab; delete it.

**Travel Schedule**
- [ ] Upcoming / Potential / Archived sections show trips; ★ marks permanent ones.
- [ ] **New Trip** → fill the form → Save → it appears.
- [ ] Click a trip to edit it; change a date inline in the table.
- [ ] Select an upcoming trip → **Add to Analyst Bandwidth** (creates a task).
- [ ] Select one row → **Delete** → confirm → it's gone.

**Monitoring Process**
- [ ] Funds are grouped by Level 1→3, oldest monitoring date first; overdue rows
      are red.
- [ ] Change a row's Status / Analyst / Level inline; edit a date.
- [ ] **New Fund** and editing a fund via the popup work.
- [ ] Select several rows → **Bulk Edit**; **Export** downloads a file.

**Portfolio Research Committee**
- [ ] Meeting Schedule and Meeting Archive tables show data.
- [ ] Edit a "Projected Next" date; open **Mapping** and **Fund List** popups.

**Analyst Bandwidth**
- [ ] One card per analyst with task counts; the **Period** filter defaults to
      Current Month.
- [ ] **New Task** → Save; mark a task **Complete**; delete a task.
- [ ] Filters (analyst, label, status, search) change what's shown.

**Workflow Calendar**
- [ ] Month grid shows multi-day travel bars and task chips.
- [ ] Click a task chip to edit it; use Prev/Next/Today.

**Cross-cutting**
- [ ] Click a column header to sort (ascending → descending → off).
- [ ] After an edit, press **Ctrl+Z** (or the ↶ button) to undo; **Ctrl+Y** to redo.
- [ ] All dates read as mm/dd/yyyy.

## Known limits in demo mode (not bugs)
- Data is per-browser and resets if you clear it or click **Sign out**.
- No sign-in screen, no other users, no live updates from teammates — those turn
  on only in the full (Supabase-backed) deployment.
