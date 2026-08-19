type Location = {
  city?: string | null
  state?: string | null
  country?: string | null
  /** Street-level detail. Already includes city/state/country when present, so it wins outright. */
  address?: string | null
}

/** Null when nothing was ever imported for it, rather than an empty string. */
export function formatLocation(location: Location): string | null {
  if (location.address) return location.address

  const parts = [location.city, location.state, location.country].filter((part): part is string =>
    Boolean(part)
  )

  return parts.length > 0 ? parts.join(', ') : null
}
