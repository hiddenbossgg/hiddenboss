import vine from '@vinejs/vine'
import { isValidTimezone } from '#lib/geo/timezones'

/**
 * Paths a league slug may not take.
 *
 * Leagues live at the root — `hiddenboss.gg/<slug>` — so `:league` would swallow
 * every literal top-level path if it were matched first. Registration order
 * keeps the literals winning, which means a league slugged `login` would be
 * created and then be permanently unreachable. Refusing the slug up front is the
 * half of that problem worth solving.
 *
 * Words not routed yet are reserved anyway, so adding `/about` later does not
 * strand a league that already took the name. `tests/functional/league_scoping`
 * checks this list against the router, so a new top-level route cannot be added
 * without one.
 */
export const RESERVED_LEAGUE_SLUGS = [
  'about',
  'admin',
  'api',
  'assets',
  'docs',
  'health',
  'help',
  'leagues',
  'login',
  'logout',
  'password',
  'privacy',
  'settings',
  'signup',
  'static',
  'terms',
  'uploads',
]

/**
 * Slugs appear in public URLs (`/:league`) and are compared case-insensitively
 * by Postgres, so the stored form is lowercased and restricted to characters
 * that survive a URL unescaped.
 */
const slug = () =>
  vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(2)
    .maxLength(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const name = () => vine.string().trim().minLength(2).maxLength(120)
const description = () => vine.string().trim().maxLength(2000).nullable()
const visibility = () => vine.enum(['public', 'private'] as const)

/**
 * An IANA identifier, checked against the zones ICU knows
 */
const timezone = () =>
  vine
    .string()
    .trim()
    .use(
      vine.createRule((value, _options, field) => {
        if (typeof value !== 'string' || !isValidTimezone(value)) {
          field.report('timezone must be a recognized time zone', 'timezone', field)
        }
      })()
    )
    .nullable()

export const createLeagueValidator = vine.create({
  name: name(),
  slug: slug().notIn(RESERVED_LEAGUE_SLUGS).unique({ table: 'leagues', column: 'slug' }),
  description: description().optional(),
  visibility: visibility().optional(),
  timezone: timezone().optional(),
})

/**
 * The slug is deliberately not editable. Changing it would break every public
 * link a community has already shared, which is the opposite of what a league
 * page is for.
 */
export const updateLeagueValidator = vine.create({
  name: name(),
  description: description().optional(),
  visibility: visibility().optional(),
  timezone: timezone().optional(),
})
