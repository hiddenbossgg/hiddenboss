import type React from 'react'
import { useEffect, useState } from 'react'
import { Link, useRouter } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import LocationAutocompleteInput from '../../components/location_autocomplete_input.js'
import { useLocationSuggestions } from '../../hooks/use_location_suggestions.js'

/** Reads the page's own query string once, for the initial state below. */
function initialQueryParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

type SortMode = 'rating-desc' | 'rating-asc' | 'alpha' | 'alpha-desc'

const SORT_LABELS: Record<SortMode, string> = {
  'rating-desc': 'Rating (high to low)',
  'rating-asc': 'Rating (low to high)',
  'alpha': 'Alphabetical (A–Z)',
  'alpha-desc': 'Alphabetical (Z–A)',
}
const SORT_MODES = Object.keys(SORT_LABELS) as SortMode[]
const DEFAULT_SORT_MODE: SortMode = 'rating-desc'

type PageSizeOption = '20' | '50' | '100' | 'custom'

const PRESET_PAGE_SIZES: PageSizeOption[] = ['20', '50', '100']
const DEFAULT_PAGE_SIZE = 50

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  ranking: { slug: string; name: string } | null
  rankings: Array<{ slug: string; name: string }>
  players: Array<{
    id: string
    slug: string
    displayTag: string
    city: string | null
    state: string | null
    country: string | null
    rank: number | null
    rating: number | null
    inactive: boolean
  }>
  matchups: Array<{ loId: string; hiId: string; loWins: number; hiWins: number }>
}

const H2h: React.FC<Props> = ({ league, canManage, ranking, rankings, players, matchups }) => {
  const [excludeInactive, setExcludeInactive] = useState(
    () => initialQueryParams().get('excludeInactive') === '1'
  )
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const fromUrl = initialQueryParams().get('sort')
    return (SORT_MODES as string[]).includes(fromUrl ?? '')
      ? (fromUrl as SortMode)
      : DEFAULT_SORT_MODE
  })

  // `pageSize` is a plain row count
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>(() => {
    const fromUrl = Number.parseInt(initialQueryParams().get('pageSize') ?? '', 10)
    if (!Number.isFinite(fromUrl) || fromUrl <= 0) return '50'
    return PRESET_PAGE_SIZES.includes(String(fromUrl) as PageSizeOption)
      ? (String(fromUrl) as PageSizeOption)
      : 'custom'
  })
  const [customPageSize, setCustomPageSize] = useState(() => {
    const fromUrl = Number.parseInt(initialQueryParams().get('pageSize') ?? '', 10)
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : DEFAULT_PAGE_SIZE
  })
  const pageSize =
    pageSizeOption === 'custom' ? Math.max(1, customPageSize) : Number(pageSizeOption)

  const [page, setPage] = useState(() => {
    const fromUrl = Number.parseInt(initialQueryParams().get('offset') ?? '', 10)
    return Number.isFinite(fromUrl) && fromUrl > 0 ? Math.floor(fromUrl / pageSize) : 0
  })
  const [search, setSearch] = useState(() => initialQueryParams().get('players') ?? '')
  const [countryFilter, setCountryFilter] = useState(
    () => initialQueryParams().get('country') ?? ''
  )
  const [stateFilter, setStateFilter] = useState(() => initialQueryParams().get('state') ?? '')
  const [cityFilter, setCityFilter] = useState(() => initialQueryParams().get('city') ?? '')
  const router = useRouter()

  const changeRanking = (slug: string) => {
    router.visit(
      { route: 'h2h.index', routeParams: { league: league.slug } },
      {
        data: {
          ranking: slug,
          ...(page > 0 ? { offset: page * pageSize } : {}),
          ...(pageSize !== DEFAULT_PAGE_SIZE ? { pageSize } : {}),
          ...(search.trim() !== '' ? { players: search } : {}),
          ...(sortMode !== DEFAULT_SORT_MODE ? { sort: sortMode } : {}),
          ...(excludeInactive ? { excludeInactive: '1' } : {}),
          ...(countryFilter.trim() !== '' ? { country: countryFilter } : {}),
          ...(stateFilter.trim() !== '' ? { state: stateFilter } : {}),
          ...(cityFilter.trim() !== '' ? { city: cityFilter } : {}),
        },
        preserveState: true,
        preserveScroll: true,
      }
    )
  }

  const changeSortMode = (mode: SortMode) => {
    setSortMode(mode)
    setPage(0)
  }
  const changeExcludeInactive = (value: boolean) => {
    setExcludeInactive(value)
    setPage(0)
  }
  const changePageSizeOption = (value: PageSizeOption) => {
    setPageSizeOption(value)
    setPage(0)
  }
  const changeCustomPageSize = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    setCustomPageSize(Number.isFinite(parsed) && parsed > 0 ? parsed : 1)
    setPage(0)
  }
  const changeSearch = (value: string) => {
    setSearch(value)
    setPage(0)
  }
  const changeCountryFilter = (value: string) => {
    setCountryFilter(value)
    setPage(0)
  }
  const changeStateFilter = (value: string) => {
    setStateFilter(value)
    setPage(0)
  }
  const changeCityFilter = (value: string) => {
    setCityFilter(value)
    setPage(0)
  }

  const countrySuggestions = useLocationSuggestions(league.slug, 'country', countryFilter)
  const stateSuggestions = useLocationSuggestions(league.slug, 'state', stateFilter, {
    country: countryFilter || undefined,
  })
  const citySuggestions = useLocationSuggestions(league.slug, 'city', cityFilter, {
    country: countryFilter || undefined,
    state: stateFilter || undefined,
  })

  const byPair = new Map(matchups.map((matchup) => [`${matchup.loId}|${matchup.hiId}`, matchup]))

  const cell = (
    rowId: string,
    colId: string
  ): { label: string; result: 'win' | 'loss' | 'even' | null } => {
    if (rowId === colId) return { label: '—', result: null }

    const lo = rowId < colId ? rowId : colId
    const hi = rowId < colId ? colId : rowId
    const matchup = byPair.get(`${lo}|${hi}`)
    if (!matchup) return { label: '—', result: null }

    const rowWins = rowId === matchup.loId ? matchup.loWins : matchup.hiWins
    const colWins = rowId === matchup.loId ? matchup.hiWins : matchup.loWins

    const result = rowWins > colWins ? 'win' : rowWins < colWins ? 'loss' : 'even'

    return { label: `${rowWins} – ${colWins}`, result }
  }

  const sortPlayers = (list: Props['players']): Props['players'] => {
    // Unrated players have nothing to sort by rating with, so they always
    // trail — alphabetically among themselves — regardless of direction.
    const byRating = (a: Props['players'][number], b: Props['players'][number], sign: 1 | -1) => {
      if (a.rank !== null && b.rank !== null) return (a.rank - b.rank) * sign
      if (a.rank !== null) return -1
      if (b.rank !== null) return 1
      return a.displayTag.localeCompare(b.displayTag)
    }

    const sorted = [...list]
    switch (sortMode) {
      case 'rating-desc':
        return sorted.sort((a, b) => byRating(a, b, 1))
      case 'rating-asc':
        return sorted.sort((a, b) => byRating(a, b, -1))
      case 'alpha':
        return sorted.sort((a, b) => a.displayTag.localeCompare(b.displayTag))
      case 'alpha-desc':
        return sorted.sort((a, b) => b.displayTag.localeCompare(a.displayTag))
    }
  }

  const locationFieldMatches = (actual: string | null, expected: string): boolean => {
    if (expected.trim() === '') return true
    if (actual === null) return false
    return actual.trim().toLowerCase() === expected.trim().toLowerCase()
  }
  const isRegionFiltering =
    countryFilter.trim() !== '' || stateFilter.trim() !== '' || cityFilter.trim() !== ''
  const matchesRegion = (player: Props['players'][number]): boolean =>
    locationFieldMatches(player.country, countryFilter) &&
    locationFieldMatches(player.state, stateFilter) &&
    locationFieldMatches(player.city, cityFilter)

  const sorted = sortPlayers(
    (excludeInactive ? players.filter((player) => !player.inactive) : players).filter(matchesRegion)
  )

  const searchTerms = search
    .split(';')
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
  const isSearching = searchTerms.length > 0
  const unmatchedTerms = searchTerms.filter(
    (term) => !players.some((player) => player.displayTag.toLowerCase() === term.toLowerCase())
  )
  const searched = isSearching
    ? sorted.filter((player) =>
        searchTerms.some((term) => player.displayTag.toLowerCase() === term.toLowerCase())
      )
    : sorted

  const pageCount = Math.max(1, Math.ceil(searched.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)

  // Keeps the address bar in sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const offset = currentPage * pageSize

    if (offset > 0) params.set('offset', String(offset))
    else params.delete('offset')

    if (pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize))
    else params.delete('pageSize')

    if (search.trim() !== '') params.set('players', search)
    else params.delete('players')

    if (sortMode !== DEFAULT_SORT_MODE) params.set('sort', sortMode)
    else params.delete('sort')

    if (excludeInactive) params.set('excludeInactive', '1')
    else params.delete('excludeInactive')

    if (countryFilter.trim() !== '') params.set('country', countryFilter)
    else params.delete('country')

    if (stateFilter.trim() !== '') params.set('state', stateFilter)
    else params.delete('state')

    if (cityFilter.trim() !== '') params.set('city', cityFilter)
    else params.delete('city')

    const query = params.toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(window.history.state, '', url)
  }, [
    currentPage,
    pageSize,
    search,
    sortMode,
    excludeInactive,
    countryFilter,
    stateFilter,
    cityFilter,
  ])
  // Both axes come from the same page, so the matrix stays square per page
  // rather than pairing a paginated row set against every column.
  const shown = searched.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  const rowLabel = (player: Props['players'][number]): string =>
    `${player.displayTag}${player.rating !== null ? ` (${player.rating})` : ''}${
      player.inactive ? ' · inactive' : ''
    }`

  const renderPager = (extraClassName?: string) =>
    searched.length > pageSize && (
      <p className={extraClassName ? `pager ${extraClassName}` : 'pager'}>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {pageCount} ({searched.length} player
          {searched.length === 1 ? '' : 's'})
        </span>
        <button
          type="button"
          disabled={currentPage >= pageCount - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </p>
    )

  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Head-to-Head</h1>

      <p>
        Singles record between each pair of players. Doubles and crew sets are not counted here — a
        team&apos;s record is a different thing than the individual players&apos; record.
        {ranking && <> Ordered by rating against {ranking.name}.</>}
      </p>

      {rankings.length > 0 && (
        <p>
          <label>
            Ranking{' '}
            <select
              value={ranking?.slug ?? ''}
              onChange={(event) => changeRanking(event.target.value)}
            >
              {rankings.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </p>
      )}

      <p>
        <label>
          Show only{' '}
          <input
            type="text"
            className="h2h-search-input"
            placeholder="e.g. Armada; Hungrybox; PPMD"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
          />
        </label>
        {unmatchedTerms.length > 0 && <> — no player named {unmatchedTerms.join(', ')}</>}
      </p>

      <p>
        <label>
          Region{' '}
          <LocationAutocompleteInput
            name="country"
            ariaLabel="Country"
            placeholder="any country"
            value={countryFilter}
            suggestions={countrySuggestions}
            onChange={changeCountryFilter}
            onSelect={(suggestion) => changeCountryFilter(suggestion.country ?? suggestion.label)}
          />{' '}
          <LocationAutocompleteInput
            name="state"
            ariaLabel="State or province"
            placeholder="any state/province"
            value={stateFilter}
            suggestions={stateSuggestions}
            onChange={changeStateFilter}
            onSelect={(suggestion) => changeStateFilter(suggestion.state ?? suggestion.label)}
          />{' '}
          <LocationAutocompleteInput
            name="city"
            ariaLabel="City"
            placeholder="any city"
            value={cityFilter}
            suggestions={citySuggestions}
            onChange={changeCityFilter}
            onSelect={(suggestion) => changeCityFilter(suggestion.city ?? suggestion.label)}
          />
        </label>
      </p>

      <p>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={excludeInactive}
            onChange={(event) => changeExcludeInactive(event.target.checked)}
          />
          Exclude inactive players
        </label>
      </p>

      {renderPager()}

      {searched.length < 2 ? (
        <p>
          {isSearching || isRegionFiltering
            ? 'Need at least two matching players to show a head-to-head table.'
            : 'Need at least two players to show a head-to-head table.'}
        </p>
      ) : (
        <div className="h2h-scroll">
          <table className="h2h-table">
            <thead>
              <tr>
                <th />
                {shown.map((player) => (
                  <th key={player.id} title={player.displayTag}>
                    <Link
                      route="players.show"
                      routeParams={{ league: league.slug, player: player.slug }}
                    >
                      {player.displayTag}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <th title={rowLabel(row)}>
                    <Link
                      route="players.show"
                      routeParams={{ league: league.slug, player: row.slug }}
                    >
                      {row.displayTag}
                    </Link>
                    {row.rating !== null && ` (${row.rating})`}
                    {row.inactive && ' · inactive'}
                  </th>
                  {shown.map((col) => {
                    const { label, result } = cell(row.id, col.id)
                    return (
                      <td key={col.id} className={result ? `h2h-${result}` : undefined}>
                        {label}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renderPager('pager-bottom')}

      <p>
        <label>
          Sort{' '}
          <select
            value={sortMode}
            onChange={(event) => changeSortMode(event.target.value as SortMode)}
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </p>

      <p>
        <label>
          Rows/columns per page{' '}
          <select
            value={pageSizeOption}
            onChange={(event) => changePageSizeOption(event.target.value as PageSizeOption)}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {pageSizeOption === 'custom' && (
          <>
            {' '}
            <input
              className="h2h-page-size-input"
              type="number"
              min={1}
              value={customPageSize}
              onChange={(event) => changeCustomPageSize(event.target.value)}
            />
          </>
        )}
      </p>
    </>
  )
}

export default H2h
