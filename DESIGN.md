# PWCE Studio design contract

## Purpose

PWCE Studio is a local operations console for inspecting evidence before requesting a reversible effect. The interface must keep current context, provenance, uncertainty, approval, and live-effect status visible together.

## Tokens

- Background: deep navy `#0d1522`.
- Surfaces: slate-blue `#152235` and `#1b2b41`.
- Text: cool white `#edf4fb`; muted text `#9fb1c5`.
- Accent: teal `#46d6c8`; use for primary actions and keyboard focus.
- Warning: amber `#f2c879`; success: green `#79df9b`; error: red `#ff8c8c`.
- Use an 8px spacing rhythm, a 14px card radius, and a 1px slate border.

## Layout

Use a readable operations hierarchy: runtime summary first, evidence second, controlled effects beside it on wide screens, and stacked sections below 800px. The page must work without hover, remain usable at narrow widths, and keep the primary action area visually separate from evidence.

## Interaction rules

1. Show unknown, stale, degraded, and error states as named states.
2. Preview precedes approval; approval precedes dispatch.
3. Live effects are disabled unless the development runtime explicitly enables them.
4. Every control has a visible label and a keyboard focus state.
5. Do not imply success until independent state reconciliation succeeds.

## Accessibility checklist

- Semantic headings and landmarks are used.
- Status updates use `aria-live`.
- Inputs have labels and buttons have explicit names.
- Focus indicators are visible.
- Text and status colors are paired with words, not color alone.

## Assistant request review

The bounded review panel uses the existing navy surfaces with a blue `#a6d2ff` action/focus accent and `#446689` section border. Records have named fields, complete wrapped identifiers and a distinct status. Five records per page keep the page manageable. Each record opens its own scope details and places confirmation and approval directly below them; dispatch is never offered inside the Human review panel. Pending, approved, expired, loading, empty and unknown-submission states use explicit text. Site changes and sign-out clear loaded records, and stale asynchronous replies cannot repopulate them. Touch targets are at least 44px and detail fields stack below 600px.
