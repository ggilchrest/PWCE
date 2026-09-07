# PWCE — Agent Instructions

## Repo layout

- This parent repo is currently **spec-only and holds no code**. All specifications live in `.private/`, which is a **separate git repo** — commit spec changes there, never here.
- Implementation code will live at this repo root when implementation begins.

## User documentation requirement

This project maintains user documentation in `docs/user-docs/` at this repo root, governed by `.private/standards/DOCUMENTATION.md`. **Any change a user could notice — new feature, altered behavior, UI or copy change, removed feature — is not done until its documentation is updated *and* a release note is written.** Backend-only changes with no visible difference are exempt.

The release note tells the human tester exactly what to test after your change: it links every QA script the change touched. Docs without it leave testers guessing.

### Current status: pre-implementation

`docs/user-docs/` does not exist yet because no code or user flows exist. Do **not** create ad-hoc user docs. When implementation produces the first runnable user flow, run the bootstrap (`.private/standards/docs-bootstrap-prompt.md`) at this repo root, seeding Phases 1–2 from the spec-derived draft map at `.private/standards/feature-map-draft.md` and `.private/PWCE_PRODUCT_JOURNEYS.md`.

### Workflow (in force once `docs/user-docs/` exists)

1. **Before coding**, read `docs/user-docs/feature-map.md` and find the row(s) for the feature you're touching. That row names the exact manual page and QA script to update. New feature → you'll add a row.
2. **After implementing**, update the docs:
   - **QA script** (`docs/user-docs/qa/<feature-slug>.html`): update Purpose, Acceptance Criteria, and Testing Instructions to match current behavior of the whole feature — not just your change. Add a change-history line. New feature → create the script from the standard's template.
   - **User Manual** (`docs/user-docs/manual/<journey-slug>.html`): update the affected walkthrough sections and re-read surrounding steps for accuracy. The manual covers the full journey and has no Acceptance Criteria. New journey → create the page and add it to `manual/index.html`.
   - **Screenshots**: recapture every screenshot whose UI your change altered (run the app; follow the standard's viewport/naming rules). Stale screenshots are defects.
   - **Feature map**: update the row (paths, date) or add a new one. Removed feature → remove its row, script, and journey sections.
   - **Release note** (`docs/user-docs/releases/<YYYY-MM-DD>-<change-slug>.html`): write one note per change in plain language — what changed, why it matters, and a linked list of every affected QA script with what to focus on. Link updated manual pages, list recaptured screenshots, then add the note to the top of `releases/index.html`. Link, don't duplicate: never restate QA steps in the note.
3. **Verify** against the definition-of-done checklist in `.private/standards/DOCUMENTATION.md` §10: map accurate, links resolve, screenshots exist, index in sync, release note written, and every affected QA script linked from it.

### Writing rules (non-negotiable)

Plain language for an average person: short sentences, second person, no jargon. Quote on-screen labels exactly. Every screenshot has a caption and alt text. All pages use `docs/user-docs/assets/docs.css` — no inline styles. Release notes describe the change from the user's point of view, never in implementation terms.
