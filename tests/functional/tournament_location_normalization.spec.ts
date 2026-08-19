import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import EventImport from '#models/event_import'
import League from '#models/league'
import Tournament from '#models/tournament'
import { EventImporterService } from '#services/imports/event_importer_service'

/**
 * `TournamentWriterService` is the single write path every platform funnels
 * through, so exercising it via the manual/CSV adapter is enough to prove
 * the normalisation applies regardless of which adapter produced the data —
 * coverage for the rule itself lives in `country.spec.ts`.
 */
test.group('tournament location normalisation', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function importTournament(payload: Record<string, unknown>) {
    const league = await League.create({
      slug: 'geo-import',
      name: 'Geo Import',
      visibility: 'public',
    })

    const eventImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'manual',
      status: 'queued',
      payload: {
        name: 'Geo Weekly',
        slug: 'geo-weekly',
        entrants: 'name\nAlice\nBob\n',
        sets: 'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\n',
        ...payload,
      },
    })

    const finished = await new EventImporterService().run({ eventImportId: eventImport.id })
    return Tournament.findOrFail(finished.tournamentId!)
  }

  test('a spelled-out state is stored as its ISO code', async ({ assert }) => {
    const tournament = await importTournament({ country: 'US', state: 'Washington' })

    assert.equal(tournament.state, 'WA')
  })

  test('a state already given as a code is left alone', async ({ assert }) => {
    const tournament = await importTournament({ country: 'US', state: 'WA' })

    assert.equal(tournament.state, 'WA')
  })

  test('a state country-state-city does not recognise is kept as reported', async ({ assert }) => {
    const tournament = await importTournament({ country: 'US', state: 'Not A Real Place' })

    assert.equal(tournament.state, 'Not A Real Place')
  })
})
