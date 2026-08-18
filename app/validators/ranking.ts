import vine from '@vinejs/vine'

/**
 * One activity clause: at least `count` tournaments with `minEntrants` or
 * more entrants. `minEntrants` omitted means any size counts.
 */
const activityRequirement = vine.object({
  count: vine.number().min(1),
  minEntrants: vine.number().min(1).optional(),
})

/**
 * The enum lists exactly what `RankingRecomputerService` can run. Offering an
 * algorithm it cannot would fail at recompute time rather than at the point of
 * entry, which is a much worse place to find out.
 */
export const createRankingValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(120),
  slug: vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(2)
    .maxLength(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  algorithm: vine.enum(['elo', 'glicko2', 'openskill'] as const),
  recomputeMode: vine.enum(['manual', 'auto'] as const).optional(),
  /** Bounds which tournaments the ranking counts. Omitted means unbounded. */
  startsAt: vine.date().optional(),
  endsAt: vine.date().optional(),
  /**
   * All clauses a league player must satisfy — within the ranking's date
   * range — to appear on the standings page, e.g. 3 tournaments with 8+
   * entrants and 5 tournaments of any size.
   */
  activityRequirements: vine.array(activityRequirement).optional(),
  /** false (default): drop them from the page. true: keep them, flagged. */
  flagInactive: vine.boolean().optional(),
})

/**
 * Date range and activity requirements only — name, slug, algorithm and
 * recompute mode are fixed at creation, matching the rest of the app, which
 * has no edit path for those either.
 */
export const updateRankingValidator = vine.create({
  startsAt: vine.date().optional(),
  endsAt: vine.date().optional(),
  activityRequirements: vine.array(activityRequirement).optional(),
  flagInactive: vine.boolean().optional(),
})
