/**
 * Whether a league player counts as active enough for a ranking's standings
 * page — evaluated at read time against the entrant counts of the
 * tournaments a standing already counted, never against a recompute.
 */

/**
 * One clause: at least `count` qualifying tournaments. `minEntrants: null`
 * means any tournament qualifies, including one whose entrant count the
 * platform never reported. A specific `minEntrants` excludes those unknowns,
 * since there is no evidence they clear the bar.
 */
export interface ActivityRequirement {
  count: number
  minEntrants: number | null
}

function qualifyingCount(entrantCounts: Array<number | null>, minEntrants: number | null): number {
  if (minEntrants === null || minEntrants <= 0) return entrantCounts.length
  return entrantCounts.filter(
    (entrantCount) => entrantCount !== null && entrantCount >= minEntrants
  ).length
}

/** All clauses must hold — an empty list of requirements means everyone qualifies. */
export function meetsActivityRequirements(
  tournamentEntrantCounts: Array<number | null>,
  requirements: ActivityRequirement[]
): boolean {
  return requirements.every(
    (requirement) =>
      qualifyingCount(tournamentEntrantCounts, requirement.minEntrants) >= requirement.count
  )
}
