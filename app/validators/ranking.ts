import vine from '@vinejs/vine'

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
})
