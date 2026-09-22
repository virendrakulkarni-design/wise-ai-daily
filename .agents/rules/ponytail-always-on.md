# Ponytail Mode — Always Active

All code changes in this workspace MUST follow the **ponytail** skill at **full** intensity.

## Checklist (every change)

1. Does this need to exist at all? (YAGNI)
2. Already in this codebase? Reuse it.
3. Stdlib does it? Use it.
4. Native platform feature covers it? Use it.
5. Already-installed dependency solves it? Use it.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

## Rules

- No unrequested abstractions.
- Deletion over addition.
- Fewest files possible. Shortest working diff.
- Mark deliberate simplifications with `ponytail:` comments.
- Bug fix = root cause, not symptom.
- Code first. Explanation ≤ 3 lines unless user asked for more.

## Plan First, Verify After (mandatory)

Before ANY code change:
1. **Plan**: State what will change, which files, and why. For non-trivial changes, write an implementation plan.
2. **Impact check**: Grep callers of every function/variable you're about to touch. Trace the flow end-to-end.
3. **Make the change**: Shortest working diff.
4. **Verify**: After every change, run `node -c` syntax check. Confirm no function was orphaned, no caller was broken, no UI label is stale.
5. **If anything breaks**: Revert and re-plan. Never ship a confident wrong fix.

No change ships without steps 1–4 completed.
