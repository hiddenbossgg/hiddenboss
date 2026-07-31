/**
 * A small RFC 4180 CSV reader.
 *
 * Hand-written rather than pulled in as a dependency because the requirement is
 * narrow — parse a pasted table — and the failure modes we care about (quoted
 * commas, embedded newlines, CRLF from spreadsheet exports) are few and worth
 * owning outright.
 */

export type CsvRow = Record<string, string>

export class CsvError extends Error {}

function splitRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    // Ignore the trailing blank line every text editor leaves behind.
    if (row.length > 1 || row[0] !== '') {
      rows.push(row)
    }
    row = []
  }

  while (index < input.length) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }

      field += char
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      index += 1
      continue
    }

    if (char === ',') {
      pushField()
      index += 1
      continue
    }

    if (char === '\r') {
      index += 1
      continue
    }

    if (char === '\n') {
      pushRow()
      index += 1
      continue
    }

    field += char
    index += 1
  }

  if (inQuotes) {
    throw new CsvError('The file ends inside a quoted value')
  }

  if (field !== '' || row.length > 0) {
    pushRow()
  }

  return rows
}

/**
 * Parses CSV with a header row into objects keyed by column name.
 *
 * Headers are lowercased and trimmed so `Gamer Tag` and `gamer tag` both work —
 * these files are hand-made, and being strict about capitalisation would only
 * generate support questions.
 */
export function parseCsv(input: string): CsvRow[] {
  const rows = splitRows(input)
  if (rows.length === 0) {
    throw new CsvError('The file is empty')
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase())
  const duplicates = headers.filter((header, position) => headers.indexOf(header) !== position)
  if (duplicates.length > 0) {
    throw new CsvError(`Duplicate column: ${duplicates[0]}`)
  }

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new CsvError(
        `Row ${rowIndex + 2} has ${values.length} values but there are ${headers.length} columns`
      )
    }

    const record: CsvRow = {}
    headers.forEach((header, position) => {
      record[header] = values[position].trim()
    })

    return record
  })
}

export function requireColumns(rows: CsvRow[], required: string[], label: string): void {
  if (rows.length === 0) return

  const present = new Set(Object.keys(rows[0]))
  const missing = required.filter((column) => !present.has(column))

  if (missing.length > 0) {
    throw new CsvError(`The ${label} file is missing the column: ${missing.join(', ')}`)
  }
}

export function optionalNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new CsvError(`"${value}" is not a number`)
  }

  return parsed
}

export function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'y', 'dq'].includes(value.toLowerCase())
}
