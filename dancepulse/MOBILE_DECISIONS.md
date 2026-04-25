# Mobile Decisions

These decisions answer the 4 unresolved items from the mobile handoff package and are the working assumptions for Phase 1.

## 1. Account system

Decision: start with phone number + SMS verification in Phase 4.

Why:
- it fits the current web stack best
- it supports cross-device sync without forcing a third-party ecosystem choice too early
- it keeps the auth model compatible with future WeChat and Apple ID bindings

Follow-up:
- reserve provider fields in the user model for future account linking
- keep local progress migration as a first-class flow right after login

## 2. Tracking video persistence

Decision: do not save raw tracking videos by default in Phase 5.

Why:
- scoring feedback is the core value, not media hosting
- it avoids early storage and privacy cost
- it keeps the first tracking release focused on latency and scoring quality

Follow-up:
- save tracking scores, timing data, and summary metrics
- add an explicit "save video" capability only after the tracking loop feels stable

## 3. Recommendation algorithm

Decision: use simple heuristic recommendation first.

Phase 1 heuristic:
- unfinished lesson first
- then unseen lessons
- prefer BPM close to the most recently learned lesson

Why:
- no cold-start problem
- easy to explain and tune
- enough for the first mobile release

Follow-up:
- revisit collaborative filtering or embedding ranking only after enough user behavior data exists

## 4. Internationalization

Decision: do not introduce a full i18n framework in Phase 1.

Why:
- the current product and design handoff are fully Chinese
- adding i18n infrastructure now would create cross-phase churn

Guardrail:
- new Phase 1 copy should be grouped in page-local constants or small helper objects instead of being scattered through deeply nested components

Revisit:
- reassess i18n after Phase 4 when account and profile surfaces stabilize
