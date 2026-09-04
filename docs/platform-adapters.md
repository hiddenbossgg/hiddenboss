# Platform adapters

How hiddenboss talks to tournament platforms.

The rule this design exists to enforce: **nothing outside `app/lib/platforms/<key>/` may know that a
particular platform exists.** The core domain, the import pipeline, identity resolution, the ranking
engine and the UI are all written against the contract below. Adding a platform means writing an
adapter and registering it — no core changes, no migration. If a new platform ever needs a change
outside its own directory, that is a defect in this contract, not a case to special-case.

> Note on naming: "platform" rather than "provider", because `providers/` is already AdonisJS's
> service-provider directory and the collision would be permanent.

## The shape of the data

Every platform is converted into one canonical hierarchy (`app/lib/platforms/canonical.ts`):

```
Tournament -> Event -> Phase -> Bracket -> Set -> Game -> Selection
```

The **Bracket** level is not incidental detail. start.gg calls it a phase group and parry.gg calls
it a bracket, and on both it is the unit that sets are actually fetched by — start.gg via
`api.start.gg/phase_group/{id}?expand[]=sets&expand[]=entrants&expand[]=seeds`, parry.gg via
`GetBracket` after `GetTournament` returns only the skeleton. Because it is the natural fetch unit
on both multi-phase platforms, it is also our unit of import progress.

Single-bracket platforms collapse onto the same shape by emitting one event with one phase
containing one bracket, so nothing downstream needs to care which kind it is dealing with.

## The contract

`app/lib/platforms/contracts.ts`:

```ts
interface PlatformAdapter {
  key: string
  displayName: string
  credentials: CredentialsSpec | null
  rateLimit: RateLimit

  matchUrl(url: string): EventRef | null
  profileUrl(account: PlatformAccountRef): string | null
  fetchEvent(ref: EventRef, context: PlatformContext, sink: ImportSink): Promise<void>
}

interface ImportSink {
  tournament(tournament: CanonicalTournament): Promise<void>
  event(event: CanonicalEvent): Promise<void>
  entrants(eventExternalId: string, entrants: CanonicalEntrant[]): Promise<void>
  phase(eventExternalId: string, phase: CanonicalPhase): Promise<void>
  bracket(
    eventExternalId: string,
    phaseExternalId: string,
    bracket: CanonicalBracket
  ): Promise<void>
  progress(completed: number, total: number | null, label?: string): Promise<void>
}
```

### One event per import

An import covers one event, because a tournament runs several and a league usually wants one of
them — the singles bracket, not the doubles beside it. `matchUrl` resolves an event link; the adapter
sends the parent tournament first so it is hydrated, then that one event. A sibling event imported
later upserts onto the same tournament row.

A link naming a whole tournament still resolves to a ref. `fetchEvent` then fails with the events it
holds, so the admin can pick one. Returning `null` from `matchUrl` instead would report a valid link
as belonging to no supported platform.

`ValidatingSink` rejects a second `event` call, which makes this contractual rather than conventional.

### Streaming into a sink, not one big object

An adapter sends each record to `sink` as it pages rather than returning a finished tournament. A
major can carry several thousand sets across a dozen events, so streaming keeps memory bounded and
lets the pipeline write rows and report progress while a fetch is still in flight.

The sink is injected for the same reason `context.http` is: the adapter is a conversion function that
performs no I/O of its own. In production it writes to the database a transaction at a time; in the
tests it is a `RecordingSink` that writes nothing. The adapter cannot tell, which is what
lets adapters be tested with no database.

Every sink call must be awaited, and errors from it must propagate. The sink is the only channel the
pipeline has for backpressure and cancellation — an adapter that catches and discards a sink error
keeps fetching after an abort, and `ValidatingSink` fails the import for that.

The ordering contract, enforced at runtime by `ValidatingSink`:

- `tournament` is called exactly once, first, to hydrate the parent
- `event` is called exactly once, and precedes its entrants, phases and brackets
- a `phase` precedes its own brackets
- `progress` may be called at any point

### Adapters never call `fetch`

They call `context.http`. Core's implementation applies the adapter's declared rate limit per
credential, retries transient failures with backoff, honours `Retry-After`, and maps failures onto
the shared error taxonomy.

This is the single most load-bearing decision in the contract. It keeps pacing and retry logic
written once instead of once per adapter, and it is the seam that lets adapter tests replay
recorded fixtures with no network and no credentials — which in turn is what makes adapters
reviewable by people who do not have an API key for that platform.

### Errors are classified, not raw

`app/lib/platforms/errors.ts` defines exactly two outcomes: `TransientPlatformError` (worth retrying —
network, 5xx, 429, with an optional `retryAfterMs`) and `PermanentPlatformError` (retrying cannot
help — bad or expired key, deleted tournament, unparseable payload). The pipeline decides retry
behaviour from these alone, so misclassification either burns retries on a hopeless request or gives
up on a blip.

Defaults live in `isRetryableHttpStatus`. Note that 401 and 403 are **permanent**: a wrong credential
does not become right by waiting, and the league admin needs to be told.

### Capabilities are observed, never declared

There is no `capabilities` field on the adapter. Instead `CapabilityObserver` accumulates what
actually arrived during an import: participant ids, seeds, placements, per-game detail, character
selections, stages.

A platform-level declaration would be wrong at the edges anyway — start.gg reports character
selections for some games and nothing for others — and a declaration that drifts from reality is
worse than none, because the UI would promise data we cannot show. Observation cannot drift.

`participantIds` is the one that matters most: it decides whether identity resolution can key on a
stable cross-tournament account or has to fall back to tag matching. Challonge has no such concept
at all, and leagues importing from it will have a busier review queue as a direct result.

### Credentials

Validation lives entirely in a VineJS schema, which is what the pipeline runs before an adapter ever
sees the values. `fields` alongside it carries only presentation metadata — label, help text, whether
to mask — so the settings form renders generically from the adapter's own declaration. The worst case
for a mismatch between the two is a missing label, never an accepted bad value.

`credentials: null` means the platform needs none, as with manual imports.

### Sources without a URL

`EventRef.payload` is an opaque bag core stores and hands back without inspecting. It exists so
imports that are not addressed by a link — an uploaded CSV, most obviously — share this contract
rather than needing a parallel one. Such adapters return `null` from `matchUrl` and are selected by
key instead.

### Linking back to a platform profile

`profileUrl(account)` turns a stored `platform_accounts` row into a link to that person's page on the
platform, or `null` when the platform has no such page. It must be pure — no I/O — because it only
reshapes what the import already wrote. What it reads is `profileSlug`, an opaque per-platform handle
on `CanonicalParticipant`: start.gg's `user.discriminator`, parry.gg's user id, whatever a platform 
looks a public profile up by. It is often the same value as `externalUserId` and distinct only where 
a platform separates its account id from its profile key; a platform with no public page leaves it 
`null` and `profileUrl` returns `null` in turn. The `user/` (or equivalent) path segment is the 
adapter's to add in `profileUrl`, not something stored — the same split `matchUrl` already uses for 
tournament slugs.

## The contract is enforced at runtime

`ValidatingSink` (`app/lib/platforms/validating_sink.ts`) wraps the sink on every import, so the
contract holds for every adapter — including one nobody wrote a test for. A violation fails that
import with a `PermanentPlatformError` naming exactly what went wrong, instead of writing rows that
are quietly wrong.

It rejects:

- a second `tournament`, or anything sent before the first one
- entrants, phases or brackets for an event that was never announced
- a bracket whose phase was never announced
- entrants sent after their own event's brackets, which would leave those sets unchecked
- the same entrant twice in one event, which would merge two competitors
- the same set twice in one bracket, which would silently overwrite the first
- **a set, game winner, or character selection referencing an entrant we were never told about**
- a winner who was not one of the set's own entrants
- any further call after one has already failed, which is how an adapter would otherwise keep
  fetching through an abort

The entrant reference check is the one that matters most. An unknown id used to be written as `null`,
which is indistinguishable from a bye, so rankings silently dropped the set.

Deliberately **not** rejected: a completed set with no winner. That is unusual data rather than a
broken contract — rating already excludes undecided sets — and failing a whole import over one odd
bracket would be worse than importing it.

### What tests still have to cover

Two requirements no single run can observe, so each adapter asserts them itself:

- **Determinism** — importing the same fixture twice produces an identical sequence of sink calls.
  Conversion has to be stable because the pipeline retries and re-syncs; anything order- or
  clock-dependent shows up as spurious changes on every refresh. `runTwice()` in
  `tests/unit/platforms/run_adapter.ts` does the comparison.
- **URL matching and credentials** — no sink is involved, so these are ordinary assertions: the
  adapter recognises its own links, rejects foreign ones, and its credential schema rejects an empty
  payload.

Adapter tests run through `runAdapter()`, which wraps `ValidatingSink` exactly as the pipeline does.
That is why a contract violation surfaces as a failing unit test with the same message it would
produce in production.

## Adding a platform

1. Create `app/lib/platforms/<key>/` with an adapter implementing `PlatformAdapter`.
2. Record fixtures for a real event and write a fixture-backed `context.http`. Record two events of
   one tournament if the platform has team events, so multi-participant entrants stay covered.
3. Write a spec that runs it through `runAdapter()`, plus the determinism and URL/credential
   assertions above.
4. Register the adapter.

That is the whole list. Anything else you find yourself needing to touch is a bug in this contract —
please open an issue rather than working around it.

## Validating the abstraction

An abstraction validated against one implementation is just that implementation with extra steps.
Tier 0 therefore ships two adapters from opposite corners — one remote, credentialed, paginated and
data-rich; one local, credential-free and minimal — plus an in-memory fake used by the contract's own
tests that shares no code with either. Each platform added afterwards is another live test of the
same claim.
