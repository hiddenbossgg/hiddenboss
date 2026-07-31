import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The initial hiddenboss schema, in dependency order: extensions, users, game
 * catalog, global identity, canonical tournament data, leagues and league
 * identity, rankings, imports.
 *
 * One migration only until the first release; after that, changes get their own
 * files.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * `pg_trgm` backs fuzzy gamertag matching during identity resolution and
     * `citext` gives case-insensitive slugs. Both are why Postgres is the only
     * supported database.
     */
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS citext')

    this.schema.createTable('users', (table) => {
      table.uuid('id').primary().notNullable()
      table.string('full_name').nullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()

      /**
       * Instance administrators manage global player identity and anything
       * crossing league boundaries. League staff never need it.
       */
      table.boolean('is_instance_admin').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    /**
     * The game catalog. Platforms name games, characters and stages
     * differently, so imports keep the platform's raw strings and map onto
     * these rows separately.
     */
    this.schema.createTable('games', (table) => {
      table.uuid('id').primary().notNullable()
      table.specificType('slug', 'citext').notNullable().unique()
      table.string('name').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('game_characters', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
      table.string('name').notNullable()

      /** Per-platform identifiers for this character, keyed by platform. */
      table.jsonb('external_ids').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['game_id', 'name'])
    })

    this.schema.createTable('game_stages', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
      table.string('name').notNullable()
      table.jsonb('external_ids').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['game_id', 'name'])
    })

    /**
     * Global identity: a person, instance-wide. Accounts attach to a global
     * player only on confirmed evidence, never on tag similarity.
     */
    this.schema.createTable('global_players', (table) => {
      table.uuid('id').primary().notNullable()
      table.specificType('slug', 'citext').notNullable().unique()
      table.string('display_tag').notNullable()
      table.string('country', 2).nullable()
      table.string('pronouns').nullable()
      table.jsonb('socials').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('platform_accounts', (table) => {
      table.uuid('id').primary().notNullable()

      /** Validated against the platform registry, never a database enum. */
      table.string('platform_key').notNullable()

      /**
       * The platform's stable, cross-tournament account id. Platforms with no
       * such concept get a synthesised value and `weak_identity = true`, which
       * is what forces those imports onto tag matching.
       */
      table.string('external_user_id').notNullable()
      table.boolean('weak_identity').notNullable().defaultTo(false)

      table.string('gamer_tag').notNullable()
      table.string('prefix').nullable()
      table.string('pronouns').nullable()

      /**
       * Lowercased, prefix- and whitespace-stripped tag for fuzzy matching.
       * Maintained by the application rather than a generated column, because
       * the normalisation rules will change as we learn.
       */
      table.string('normalized_tag').notNullable()

      table
        .uuid('global_player_id')
        .nullable()
        .references('id')
        .inTable('global_players')
        .onDelete('SET NULL')

      table.jsonb('raw').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['platform_key', 'external_user_id'])
      table.index(['global_player_id'])
    })

    this.schema.raw(
      'CREATE INDEX platform_accounts_normalized_tag_trgm ' +
        'ON platform_accounts USING gin (normalized_tag gin_trgm_ops)'
    )

    /** Why an account is believed to belong to a person, so it can be undone. */
    this.schema.createTable('global_identity_links', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('platform_account_id')
        .notNullable()
        .references('id')
        .inTable('platform_accounts')
        .onDelete('CASCADE')
      table
        .uuid('global_player_id')
        .notNullable()
        .references('id')
        .inTable('global_players')
        .onDelete('CASCADE')

      /** e.g. `platform_verified`, `admin`. */
      table.string('source').notNullable()
      table.jsonb('evidence').notNullable().defaultTo('{}')
      table
        .uuid('confirmed_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['platform_account_id', 'global_player_id'])
    })

    /**
     * Canonical tournament data, stored once per instance and shared by every
     * league that counts it. Mirrors the platform adapter's canonical model:
     *
     *   tournaments -> events -> phases -> brackets -> sets -> set_games -> selections
     *
     * Every level carries `(parent, external_id)` uniqueness so a re-import is
     * a plain upsert and can never duplicate rows.
     */
    this.schema.createTable('tournaments', (table) => {
      table.uuid('id').primary().notNullable()
      table.string('platform_key').notNullable()
      table.string('external_id').notNullable()

      table.string('slug').notNullable()
      table.string('name').notNullable()
      table.text('url').nullable()
      table.timestamp('start_at').nullable()
      table.timestamp('end_at').nullable()
      table.string('location').nullable()
      table.boolean('is_online').nullable()

      /** What the import actually contained, observed rather than declared. */
      table.jsonb('capabilities').notNullable().defaultTo('{}')

      table.timestamp('imported_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['platform_key', 'external_id'])
      table.index(['start_at'])
    })

    this.schema.createTable('events', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('tournament_id')
        .notNullable()
        .references('id')
        .inTable('tournaments')
        .onDelete('CASCADE')
      table.string('external_id').notNullable()

      table.string('name').notNullable()

      /** The platform's own game name, kept verbatim. */
      table.string('game_name').nullable()
      /** Resolved against the catalog. Null until catalog mapping exists. */
      table.uuid('game_id').nullable().references('id').inTable('games').onDelete('SET NULL')

      table.string('entry_kind').notNullable().defaultTo('singles')
      table.integer('team_size').nullable()
      table.integer('entrant_count').nullable()
      table.jsonb('capabilities').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['tournament_id', 'external_id'])
      table.index(['game_id'])
    })

    this.schema.createTable('phases', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE')
      table.string('external_id').notNullable()
      table.string('name').nullable()
      table.integer('order').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['event_id', 'external_id'])
    })

    /**
     * start.gg calls these phase groups, parry.gg calls them brackets. Sets are
     * fetched one bracket at a time on both, which makes this our unit of import
     * progress. Single-bracket platforms emit exactly one.
     */
    this.schema.createTable('brackets', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('phase_id').notNullable().references('id').inTable('phases').onDelete('CASCADE')
      table.string('external_id').notNullable()
      table.string('name').nullable()
      table.string('bracket_type').notNullable().defaultTo('other')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['phase_id', 'external_id'])
    })

    this.schema.createTable('entrants', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE')
      table.string('external_id').notNullable()

      table.string('name').notNullable()
      table.integer('seed').nullable()
      table.integer('placement').nullable()
      table.boolean('is_disqualified').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['event_id', 'external_id'])
      table.index(['placement'])
    })

    /**
     * An entrant is one or more people: one for singles, several for doubles
     * and crews. Identity resolution joins through here, never directly from
     * the entrant, so a team event resolves to several players.
     */
    this.schema.createTable('entrant_participants', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('entrant_id')
        .notNullable()
        .references('id')
        .inTable('entrants')
        .onDelete('CASCADE')
      table
        .uuid('platform_account_id')
        .notNullable()
        .references('id')
        .inTable('platform_accounts')
        .onDelete('CASCADE')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['entrant_id', 'platform_account_id'])
      table.index(['platform_account_id'])
    })

    this.schema.createTable('sets', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('bracket_id')
        .notNullable()
        .references('id')
        .inTable('brackets')
        .onDelete('CASCADE')
      table.string('external_id').notNullable()

      table.string('state').notNullable().defaultTo('pending')
      table.integer('round').nullable()
      table.string('identifier').nullable()
      table.string('full_round_text').nullable()

      /** Null is normal: start.gg leaves it unset outside double elimination. */
      table.integer('ordinal').nullable()

      table.uuid('entrant_a_id').nullable().references('id').inTable('entrants').onDelete('CASCADE')
      table.uuid('entrant_b_id').nullable().references('id').inTable('entrants').onDelete('CASCADE')
      table
        .uuid('winner_entrant_id')
        .nullable()
        .references('id')
        .inTable('entrants')
        .onDelete('CASCADE')

      table.integer('score_a').nullable()
      table.integer('score_b').nullable()

      /**
       * Disqualified from this set, per side, so a double DQ is representable.
       * Platforms encode it as a magic score — start.gg uses `-1` — which the
       * adapters translate rather than storing verbatim.
       */
      table.boolean('entrant_a_disqualified').notNullable().defaultTo(false)
      table.boolean('entrant_b_disqualified').notNullable().defaultTo(false)
      table.timestamp('completed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['bracket_id', 'external_id'])

      /**
       * Ranking recomputes replay completed sets in chronological order, so this
       * is the index that decides how fast a recompute is.
       */
      table.index(['completed_at'])
      table.index(['entrant_a_id'])
      table.index(['entrant_b_id'])
    })

    this.schema.createTable('set_games', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('set_id').notNullable().references('id').inTable('sets').onDelete('CASCADE')

      /** 1-indexed. */
      table.integer('number').notNullable()
      table
        .uuid('winner_entrant_id')
        .nullable()
        .references('id')
        .inTable('entrants')
        .onDelete('CASCADE')

      table.string('stage_name').nullable()
      table.uuid('stage_id').nullable().references('id').inTable('game_stages').onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['set_id', 'number'])
    })

    this.schema.createTable('set_game_selections', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('set_game_id')
        .notNullable()
        .references('id')
        .inTable('set_games')
        .onDelete('CASCADE')
      table
        .uuid('entrant_id')
        .notNullable()
        .references('id')
        .inTable('entrants')
        .onDelete('CASCADE')

      /** Null when the platform reports a pick without saying who made it. */
      table
        .uuid('platform_account_id')
        .nullable()
        .references('id')
        .inTable('platform_accounts')
        .onDelete('SET NULL')

      table.string('character_name').notNullable()
      table
        .uuid('character_id')
        .nullable()
        .references('id')
        .inTable('game_characters')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['set_game_id'])
      table.index(['character_id'])
    })

    /**
     * Single-use credentials emailed to a user: password resets today, address
     * verification later.
     *
     * The token is stored as a SHA-256 hash, never in the clear. A reset token is
     * a bearer credential — anyone holding one can take the account — so a
     * database dump or a stray log must not hand them out. The plaintext exists
     * only in the email that was sent.
     */
    this.schema.createTable('auth_tokens', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')

      /** `password_reset`, and later `verify_email`. */
      table.string('type').notNullable()
      table.string('token_hash', 64).notNullable()

      table.timestamp('expires_at').notNullable()

      /** Set the moment it is redeemed, which is what makes it single-use. */
      table.timestamp('consumed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      /** Lookup is by hash alone; the type is checked after. */
      table.unique(['token_hash'])
      table.index(['user_id', 'type'])
    })

    this.schema.createTable('leagues', (table) => {
      table.uuid('id').primary().notNullable()
      table.specificType('slug', 'citext').notNullable().unique()
      table.string('name').notNullable()
      table.text('description').nullable()

      /** `public` or `private`. Private leagues are visible to admins only. */
      table.string('visibility').notNullable().defaultTo('public')
      table.jsonb('theme').notNullable().defaultTo('{}')

      table
        .uuid('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      /**
       * Monotonic counters bumped whenever identity or corrections change. A
       * ranking recompute compares these against the values its last recompute saw to
       * decide whether resuming from saved state is safe or a full replay is
       * required. The alternative is silently-stale standings.
       */
      /**
       * Plain integers rather than bigints: the `pg` driver returns bigint as a
       * string to preserve precision, which would mean every comparison had to
       * parse first. A league would need two billion identity changes to
       * overflow this.
       */
      table.integer('identity_version').notNullable().defaultTo(0)
      table.integer('corrections_version').notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('league_admins', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')

      /** `owner` is currently the only role issued. */
      table.string('role').notNullable().defaultTo('owner')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'user_id'])
      table.index(['user_id'])
    })

    this.schema.createTable('league_games', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'game_id'])
    })

    /**
     * Platform API keys, supplied per league so rate limits are isolated and
     * self-hosters do not depend on an instance-wide key. Values are encrypted
     * by the application; the shape is opaque here because each adapter
     * declares its own credential schema.
     */
    this.schema.createTable('league_credentials', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.string('platform_key').notNullable()
      table.string('label').nullable()
      table.text('encrypted_values').notNullable()
      table.timestamp('last_used_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'platform_key'])
    })

    /** Which canonical tournaments a league counts. */
    this.schema.createTable('league_events', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE')

      /** Weighting for points-based rankings. Not read yet. */
      table.string('tier').nullable()
      table.decimal('multiplier', 6, 3).nullable()

      table
        .uuid('added_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'event_id'])
      table.index(['event_id'])
    })

    /**
     * Who counts as one competitor within one league. Because this tier is
     * league-scoped, an admin correcting a bad match can never disturb another
     * league's history.
     */
    this.schema.createTable('league_players', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.specificType('slug', 'citext').notNullable()
      table.string('display_tag').notNullable()

      table
        .uuid('global_player_id')
        .nullable()
        .references('id')
        .inTable('global_players')
        .onDelete('SET NULL')

      table.string('country', 2).nullable()
      table.string('pronouns').nullable()
      table.jsonb('socials').notNullable().defaultTo('{}')

      /**
       * Set when this player was merged into another. The row is kept rather
       * than deleted so the merge stays reversible.
       */
      table
        .uuid('merged_into_id')
        .nullable()
        .references('id')
        .inTable('league_players')
        .onDelete('SET NULL')

      /** Drives activity filtering, which is evaluated at read time. */
      table.timestamp('last_played_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'slug'])
      table.index(['league_id', 'merged_into_id'])
    })

    this.schema.createTable('league_player_accounts', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table
        .uuid('league_player_id')
        .notNullable()
        .references('id')
        .inTable('league_players')
        .onDelete('CASCADE')
      table
        .uuid('platform_account_id')
        .notNullable()
        .references('id')
        .inTable('platform_accounts')
        .onDelete('CASCADE')

      table.decimal('confidence', 4, 3).notNullable().defaultTo(1)

      /** `auto`, `manual`, or `global`. */
      table.string('source').notNullable().defaultTo('auto')

      /**
       * Low-confidence matches still count toward rankings — an admin's inbox
       * must never be the reason standings are wrong — but are flagged for
       * review in the UI.
       */
      table.boolean('provisional').notNullable().defaultTo(false)

      table
        .uuid('confirmed_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      /** An account belongs to at most one player per league. */
      table.unique(['league_id', 'platform_account_id'])
      table.index(['league_player_id'])
    })

    /** Append-only audit log making every identity change reversible. */
    this.schema.createTable('identity_events', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('SET NULL')

      /** `link`, `unlink`, `merge`, `split`, `rename`. */
      table.string('kind').notNullable()
      table.jsonb('payload').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()

      table.index(['league_id', 'created_at'])
    })

    /**
     * A ranking is a name, an algorithm, a date range and a set of
     * requirements. Seasons and circuits are rankings configured differently,
     * not separate concepts.
     */
    this.schema.createTable('rankings', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')
      table.specificType('slug', 'citext').notNullable()
      table.string('name').notNullable()
      table.text('description').nullable()

      /** `elo`, `glicko2`, `trueskill`, or `points`. */
      table.string('algorithm').notNullable()

      /**
       * `manual` by default: an import marks the ranking stale and an admin
       * decides when standings move. Recomputing every ranking on every import
       * is quadratic in tournaments over a season, and admins want to review
       * identity matches before results become public. `auto` exists for
       * circuits that need live standings.
       */
      table.string('recompute_mode').notNullable().defaultTo('manual')

      table.timestamp('starts_at').nullable()
      table.timestamp('ends_at').nullable()

      table.jsonb('config').notNullable().defaultTo('{}')
      table.jsonb('requirements').notNullable().defaultTo('{}')

      table.boolean('published').notNullable().defaultTo(false)

      /**
       * Set by any trigger that invalidates standings. A worker captures the
       * time it started before reading anything and re-queues itself if this
       * has advanced past that, so a request arriving mid-recompute is never
       * silently dropped.
       */
      table.timestamp('recompute_requested_at').nullable()
      table.integer('stale_tournament_count').notNullable().defaultTo(0)

      /**
       * Per-tournament hash of every set replayed up to and including that
       * tournament, as `{ tournamentId: hash }`.
       *
       * Values are path-dependent — the state at tournament T depends on every
       * set before it — so a tournament's stored rows stay valid exactly while
       * its hash is unchanged. A recompute rewrites only from the first
       * tournament whose hash moved.
       */
      table.jsonb('tournament_hashes').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['league_id', 'slug'])
    })

    /**
     * One recompute. Standings belong to a recompute rather than to the ranking, so a
     * recompute is atomic from a reader's point of view: the previous recompute stays
     * readable until the new one completes.
     */
    this.schema.createTable('ranking_recomputes', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('ranking_id')
        .notNullable()
        .references('id')
        .inTable('rankings')
        .onDelete('CASCADE')

      /** `queued`, `running`, `ok`, or `failed`. */
      table.string('status').notNullable().defaultTo('queued')

      /**
       * Hash of the selected sets, league identity/corrections versions and
       * configuration. Lets a genuinely unchanged recompute exit immediately.
       */
      table.string('input_fingerprint').nullable()

      /**
       * The latest set this recompute consumed, plus the serialised final state of
       * the rating algorithm. Written from the start so incremental resume can
       * be enabled later without a migration; nothing reads them until then.
       */
      table.timestamp('watermark_at').nullable()
      table.jsonb('algorithm_state').nullable()

      /**
       * What this recompute saw, so the next one can tell whether anything
       * retroactive changed. The fingerprint above is a single hash and cannot
       * be decomposed, so the individual inputs are recorded separately.
       */
      table.integer('identity_version').nullable()
      table.integer('corrections_version').nullable()

      table.integer('set_count').notNullable().defaultTo(0)
      table.integer('player_count').notNullable().defaultTo(0)

      table.timestamp('started_at').nullable()
      table.timestamp('finished_at').nullable()
      table.text('error').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['ranking_id', 'status'])
    })

    /**
     * Added after both tables exist because the reference is circular: a
     * ranking points at its latest recompute, and a recompute belongs to a ranking.
     */
    this.schema.alterTable('rankings', (table) => {
      table
        .uuid('latest_recompute_id')
        .nullable()
        .references('id')
        .inTable('ranking_recomputes')
        .onDelete('SET NULL')
    })

    this.schema.createTable('ranking_standings', (table) => {
      table.uuid('id').primary().notNullable()
      table
        .uuid('ranking_recompute_id')
        .notNullable()
        .references('id')
        .inTable('ranking_recomputes')
        .onDelete('CASCADE')
      table
        .uuid('league_player_id')
        .notNullable()
        .references('id')
        .inTable('league_players')
        .onDelete('CASCADE')

      table.integer('rank').notNullable()
      table.integer('previous_rank').nullable()

      /** Rating or points, depending on the algorithm. */
      table.decimal('value', 12, 4).notNullable()

      /** Glicko-2 / TrueSkill uncertainty. Null for Elo and points. */
      table.decimal('deviation', 12, 4).nullable()
      table.decimal('volatility', 12, 6).nullable()

      table.integer('wins').notNullable().defaultTo(0)
      table.integer('losses').notNullable().defaultTo(0)
      table.integer('sets_played').notNullable().defaultTo(0)
      table.integer('events_counted').notNullable().defaultTo(0)

      /**
       * Standings are computed for everyone; activity windows are applied when
       * the page is read, because a player becomes inactive as the calendar
       * moves rather than because any data changed.
       */
      table.timestamp('last_played_at').nullable()

      table.jsonb('metrics').notNullable().defaultTo('{}')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['ranking_recompute_id', 'league_player_id'])
      table.index(['ranking_recompute_id', 'rank'])
    })

    /**
     * A player's rank and value as at each tournament, for charts with time on
     * the horizontal axis.
     *
     * Same concept as `ranking_standings`, anchored differently: that one is the
     * standing as of a recompute, this one as of a tournament. Tournaments are
     * the boundary because they carry a real date; a per-set series would need
     * the whole field re-sorted after every set.
     */
    this.schema.createTable('ranking_tournament_standings', (table) => {
      table.uuid('id').primary().notNullable()

      /**
       * Keyed by ranking rather than by recompute, so rows are upserted in
       * place and storage stays proportional to the data rather than to how
       * often it is recomputed.
       */
      table
        .uuid('ranking_id')
        .notNullable()
        .references('id')
        .inTable('rankings')
        .onDelete('CASCADE')
      table
        .uuid('league_player_id')
        .notNullable()
        .references('id')
        .inTable('league_players')
        .onDelete('CASCADE')
      table
        .uuid('tournament_id')
        .notNullable()
        .references('id')
        .inTable('tournaments')
        .onDelete('CASCADE')

      /** The tournament's date, so the series is plottable against time. */
      table.timestamp('occurred_at').notNullable()

      table.integer('rank').notNullable()
      table.decimal('value', 12, 4).notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['ranking_id', 'league_player_id', 'tournament_id'])
      table.index(['ranking_id', 'league_player_id', 'occurred_at'])
      table.index(['ranking_id', 'tournament_id', 'rank'])
    })

    /**
     * Per-set rating delta, so a player can see why their rating moved
     * and against whom. Finer grained than the per-tournament standings above.
     */
    this.schema.createTable('ranking_set_deltas', (table) => {
      table.uuid('id').primary().notNullable()

      /** Keyed by ranking rather than recompute, as with the standings above. */
      table
        .uuid('ranking_id')
        .notNullable()
        .references('id')
        .inTable('rankings')
        .onDelete('CASCADE')
      table
        .uuid('league_player_id')
        .notNullable()
        .references('id')
        .inTable('league_players')
        .onDelete('CASCADE')

      table.uuid('set_id').notNullable().references('id').inTable('sets').onDelete('CASCADE')
      table
        .uuid('tournament_id')
        .notNullable()
        .references('id')
        .inTable('tournaments')
        .onDelete('CASCADE')

      table.timestamp('occurred_at').notNullable()
      table.decimal('value_before', 12, 4).notNullable()
      table.decimal('value_after', 12, 4).notNullable()
      table.decimal('delta', 12, 4).notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['ranking_id', 'league_player_id', 'set_id'])
      table.index(['ranking_id', 'league_player_id', 'occurred_at'])
    })

    /**
     * A progress and audit record for one import, not an orchestrator: the job
     * chain drives itself. It exists so an admin can see how far an import got
     * and which stage failed.
     */
    this.schema.createTable('event_imports', (table) => {
      table.uuid('id').primary().notNullable()
      table.uuid('league_id').notNullable().references('id').inTable('leagues').onDelete('CASCADE')

      table.string('platform_key').notNullable()
      table.text('target_url').nullable()

      /** Opaque adapter input for sources not addressed by URL, e.g. a CSV. */
      table.jsonb('payload').nullable()

      table
        .uuid('tournament_id')
        .nullable()
        .references('id')
        .inTable('tournaments')
        .onDelete('SET NULL')

      /** The one event this import hydrated. Null until it has been written. */
      table.uuid('event_id').nullable().references('id').inTable('events').onDelete('SET NULL')

      /** `queued`, `running`, `ok`, `partial`, or `failed`. */
      table.string('status').notNullable().defaultTo('queued')

      /** Which stage was last entered, so a failure points somewhere useful. */
      table.string('stage').nullable()

      table.integer('brackets_total').nullable()
      table.integer('brackets_done').notNullable().defaultTo(0)

      table.jsonb('stats').notNullable().defaultTo('{}')
      table.text('error').nullable()

      table
        .uuid('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('finished_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['league_id', 'created_at'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable('event_imports')
    this.schema.dropTable('ranking_set_deltas')
    this.schema.dropTable('ranking_tournament_standings')
    this.schema.dropTable('ranking_standings')
    this.schema.alterTable('rankings', (table) => {
      table.dropColumn('latest_recompute_id')
    })
    this.schema.dropTable('ranking_recomputes')
    this.schema.dropTable('rankings')
    this.schema.dropTable('identity_events')
    this.schema.dropTable('league_player_accounts')
    this.schema.dropTable('league_players')
    this.schema.dropTable('league_events')
    this.schema.dropTable('league_credentials')
    this.schema.dropTable('league_games')
    this.schema.dropTable('league_admins')
    this.schema.dropTable('leagues')
    this.schema.dropTable('set_game_selections')
    this.schema.dropTable('set_games')
    this.schema.dropTable('sets')
    this.schema.dropTable('entrant_participants')
    this.schema.dropTable('entrants')
    this.schema.dropTable('brackets')
    this.schema.dropTable('phases')
    this.schema.dropTable('events')
    this.schema.dropTable('tournaments')
    this.schema.dropTable('global_identity_links')
    this.schema.dropTable('platform_accounts')
    this.schema.dropTable('global_players')
    this.schema.dropTable('game_stages')
    this.schema.dropTable('game_characters')
    this.schema.dropTable('games')
    this.schema.dropTable('auth_tokens')
    this.schema.dropTable('users')
  }
}
