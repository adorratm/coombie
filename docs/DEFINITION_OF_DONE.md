# Definition of Done

A feature is not done merely because code was generated.

## Design
- Player-visible purpose is clear.
- Acceptance criteria are testable.
- Counterplay/readability and balance impact are considered.

## Engineering
- Existing architecture and conventions are followed.
- No unrelated rewrite or unapproved dependency.
- Lifecycle cleanup, pause/restart, and invalid-reference cases are handled.
- Save compatibility is preserved or migrated.

## Verification
- Relevant tests/build checks actually ran.
- Runtime smoke test performed where possible.
- Peak-combat/performance implications checked.
- UI/input/audio/VFX state is coherent.
- QA result distinguishes passed, failed, and not tested.

## Handoff
- Changed files listed.
- Behavior changes explained.
- Commands and results reported accurately.
- Remaining risks and follow-up tasks documented.
