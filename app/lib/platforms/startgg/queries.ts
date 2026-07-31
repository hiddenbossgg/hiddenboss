/**
 * GraphQL documents for start.gg. Recorded fixtures are keyed by a hash of the
 * request body, so editing a document or a page size invalidates them.
 *
 * Pagination is page-based (`page` / `perPage` with `pageInfo.totalPages`).
 */

/**
 * start.gg rejects any request whose response would return more than 1000
 * objects, counted across the whole nested shape rather than the top-level list.
 *
 * Page sizes are therefore per query, not shared. One entrant costs at most
 * about 13 objects (seeds, standing, and two objects per participant), while one
 * set with a full best-of-five and character selections costs around 40 — so a
 * page size safe for entrants is four times too large for sets.
 */
export const ENTRANTS_PER_PAGE = 50
export const SETS_PER_PAGE = 20

/**
 * Floor for the adaptive halving in the adapter. Below this the request count
 * per bracket grows faster than the complexity saving is worth.
 */
export const MIN_PER_PAGE = 4

/**
 * One event and the tournament that owns it.
 *
 * start.gg addresses an event by its full path — `tournament/<t>/event/<e>` —
 * so this is the whole import in one request: the parent to hydrate, the event
 * itself, and its phase and bracket structure.
 */
export const EVENT_QUERY = `
  query EventQuery($slug: String!) {
    event(slug: $slug) {
      id
      name
      numEntrants
      teamRosterSize {
        minPlayers
        maxPlayers
      }
      videogame {
        id
        name
      }
      phases {
        id
        name
        phaseOrder
      }
      phaseGroups {
        id
        displayIdentifier
        bracketType
        phase {
          id
        }
      }
      tournament {
        id
        name
        slug
        startAt
        endAt
        city
        addrState
        countryCode
        isOnline
      }
    }
  }
`

/**
 * Only used to name the events available when somebody pastes a tournament link
 * instead of an event link.
 */
export const TOURNAMENT_EVENTS_QUERY = `
  query TournamentEventsQuery($slug: String!) {
    tournament(slug: $slug) {
      id
      name
      events {
        id
        name
        slug
      }
    }
  }
`

export const EVENT_ENTRANTS_QUERY = `
  query EventEntrantsQuery($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      entrants(query: { page: $page, perPage: $perPage }) {
        pageInfo {
          totalPages
        }
        nodes {
          id
          name
          isDisqualified
          seeds {
            seedNum
          }
          standing {
            placement
          }
          participants {
            id
            gamerTag
            prefix
            user {
              id
              genderPronoun
            }
          }
        }
      }
    }
  }
`

export const PHASE_GROUP_SETS_QUERY = `
  query PhaseGroupSetsQuery($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
    phaseGroup(id: $phaseGroupId) {
      id
      sets(page: $page, perPage: $perPage, sortType: CALL_ORDER) {
        pageInfo {
          totalPages
        }
        nodes {
          id
          identifier
          round
          fullRoundText
          state
          completedAt
          winnerId
          slots {
            entrant {
              id
            }
            standing {
              stats {
                score {
                  value
                }
              }
            }
          }
          games {
            orderNum
            winnerId
            stage {
              name
            }
            selections {
              entrant {
                id
              }
              character {
                name
              }
            }
          }
        }
      }
    }
  }
`
