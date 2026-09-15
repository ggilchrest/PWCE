# Development Batch 174 — Separate-process trusted-dispatch fixture

Status: `verified` for synthetic producer/consumer HTTP transport conformance; canonical runtime action integration remains `inProgress`.

The producer-owned fixture starts an isolated loopback Gateway with a synthetic target and two fresh credentials supplied by the test runner. It reports bounded readiness and target-call counts without exposing credentials, supports synthetic grant revocation, and shuts down when its control input ends. It does not configure a saved service, read personal data or call a real target.

Lifestream's `scripts/check-pwce-dispatch-process.mjs` executes seven joined checks through the public HTTP transport: zero target calls on admission and duplicate admission; a discarded completed HTTP reply; retry returning the original result with no second target call; original invocation status; retained unknown target outcome on repeated invocation; and revocation preventing a later admitted action from dispatching. Nine dispatch wire calls produce exactly two synthetic target calls. Actual wire bodies and successful responses validate against the producer-pinned request/response schemas.

Producer baseline: `d4b9d48` (published trusted-dispatch transport). Consumer baseline: `657b0ee`, with its new dispatch client, generated pin and conformance runner under test in the recovery worktree. The consumer's enclosing evidence receipt will bind its exact source hashes and final committed revision. This fixture is not a canonical authority receipt, configured control-plane action, physical effect, selected-provider result or Human acceptance.

Validation: `node scripts/check-pwce-dispatch-process.mjs` passed all seven checks. Producer full regression at the transport baseline passed 265 tests; this fixture adds no route to the normal startup path. Raw joined log: `lifestream/.lifestream/benchmarks/pwce-dispatch-transport/2026-09-15/ls-dispatch-process.log` in the composition workspace, archived by the consumer receipt.
