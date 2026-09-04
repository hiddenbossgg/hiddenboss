import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PlatformAccount from '#models/platform_account'
import Tournament from '#models/tournament'
import { TournamentWriterService } from '#services/imports/tournament_writer_service'
import type {
  CanonicalEntrant,
  CanonicalEvent,
  CanonicalTournament,
} from '#lib/platforms/canonical'

/**
 * Adapters hand over a country exactly as the platform reported it — a
 * display name, an ISO code, or something the dataset doesn't recognise at
 * all. Normalising it is this service's job, not the adapter's.
 */
test.group('TournamentWriterService country normalisation', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  function tournament(overrides: Partial<CanonicalTournament> = {}): CanonicalTournament {
    return {
      externalId: 'tourney-1',
      slug: 'tourney-1',
      name: 'Test Tournament',
      url: null,
      startAt: null,
      endAt: null,
      country: 'United States',
      state: null,
      city: null,
      address: null,
      isOnline: false,
      ...overrides,
    }
  }

  const event: CanonicalEvent = {
    externalId: 'event-1',
    name: 'Singles',
    game: null,
    entryKind: 'singles',
    teamSize: 1,
    entrantCount: 1,
  }

  test('a recognised display name is stored as its ISO code on the tournament', async ({
    assert,
  }) => {
    const writer = new TournamentWriterService('startgg')
    await writer.writeTournament(tournament({ country: 'United States' }))

    const row = await Tournament.query().where('externalId', 'tourney-1').firstOrFail()
    assert.equal(row.country, 'US')
  })

  /**
   * `tournaments.country` is a strict `varchar(2)`, so an unresolvable value
   * dropping to `null` (rather than being kept verbatim) is also what keeps
   * a too-long display name from failing the write outright.
   */
  test('an unrecognised value is dropped to null rather than kept as reported', async ({
    assert,
  }) => {
    const writer = new TournamentWriterService('startgg')
    await writer.writeTournament(tournament({ externalId: 'tourney-2', country: 'Wakanda' }))

    const row = await Tournament.query().where('externalId', 'tourney-2').firstOrFail()
    assert.isNull(row.country)
  })

  test('a participant carrying a display name gets it normalised on their account', async ({
    assert,
  }) => {
    const writer = new TournamentWriterService('startgg')
    await writer.writeTournament(tournament({ externalId: 'tourney-3' }))
    await writer.writeEvent(event)

    const entrants: CanonicalEntrant[] = [
      {
        externalId: 'entrant-1',
        name: 'Someone',
        seed: null,
        placement: null,
        isDisqualified: false,
        participants: [
          {
            externalUserId: 'user-1',
            profileSlug: null,
            gamerTag: 'Someone',
            prefix: null,
            pronouns: null,
            country: 'United States',
            state: 'Washington',
            city: 'Seattle',
          },
        ],
      },
    ]
    await writer.writeEntrants(event.externalId, entrants)

    const account = await PlatformAccount.query()
      .where('platformKey', 'startgg')
      .where('externalUserId', 'user-1')
      .firstOrFail()

    assert.equal(account.country, 'US')
    // Only country is normalised — state stays raw, matching the canonical contract.
    assert.equal(account.state, 'Washington')
  })

  test("a participant's profile handle is stored verbatim on their account", async ({ assert }) => {
    const writer = new TournamentWriterService('startgg')
    await writer.writeTournament(tournament({ externalId: 'tourney-4' }))
    await writer.writeEvent(event)

    const entrants: CanonicalEntrant[] = [
      {
        externalId: 'entrant-1',
        name: 'Jello',
        seed: null,
        placement: null,
        isDisqualified: false,
        participants: [
          {
            externalUserId: 'user-jello',
            profileSlug: '8958b6cd',
            gamerTag: 'Jello',
            prefix: null,
            pronouns: null,
            country: null,
            state: null,
            city: null,
          },
        ],
      },
    ]
    await writer.writeEntrants(event.externalId, entrants)

    const account = await PlatformAccount.query()
      .where('platformKey', 'startgg')
      .where('externalUserId', 'user-jello')
      .firstOrFail()

    assert.equal(account.profileSlug, '8958b6cd')
  })
})
