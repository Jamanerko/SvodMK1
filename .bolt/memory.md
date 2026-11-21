# Project memory

## Product intent & audience

- Construction/warehouse management system for tracking objects, materials, needs, purchase requests, and warehouse stock.
- Users: administrators, regular users, and contractor representatives — each with different access scopes.
- Data model includes: objects (with sub-objects), materials, requirements/needs, purchase requests (заявки), warehouse, readiness/percent-complete, material sufficiency/deficit.
- AI assistant added as a chat widget giving all authenticated users natural-language queries over the same live DB data their role permits.

## Brand personality & voice

- Russian-language UI; assistant responses in Russian.
- Practical, construction-domain tone — direct summaries of readiness, deficits, and request status.
- Quick-suggestion chips use concise labels: «Общая сводка», «Готовность объектов», «Чего не хватает по материалам?», «Статус заявок».

## Visual design & UX direction

- Framework: Vite + React + Tailwind CSS + lucide-react icons; `@/` path alias maps to `src/`.
- AI assistant: floating chat button bottom-right, message history, quick-suggestion chips on first open, user phone number shown in chat header.
- Supabase used for auth and data; env/functions not available locally — assistant built client-side over cached/live DB reads.
- Production-quality, non-cookie-cutter UI expected per authoritative prompt.

## Decisions, constraints & rationale

- AI assistant operates under the authenticated user's own account/permissions — no separate auth or elevated access.
- Assistant is read-only: answers queries about objects, materials, needs, requests, readiness, and deficits; does not create or modify data yet.
- Built as a self-contained widget component; imported via `@/` alias.
- Type checking and build pass after integration.
- No extra UI packages installed; only Tailwind + lucide-react as per template.

## Open questions & assumptions

- Whether to extend assistant with write actions (create requests, edit readiness) — user may request later.
- Exact readiness/sufficiency calculation signatures assumed from existing code; not independently verified.
- Supabase function availability in deployment unknown — assistant relies on client-side data access.