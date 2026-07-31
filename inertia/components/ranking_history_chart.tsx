import type React from 'react'
import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type HistoryPoint = {
  date: string
  rank: number
  rating: number
}

type Props = {
  history: HistoryPoint[]
  rankingName: string
}

type Series = 'rank' | 'rating'

/**
 * A player's rank and rating over time, within one ranking.
 *
 * Both series live on the same points, but they cannot share an axis: rating
 * climbs when a player does well and rank falls, and their scales are unrelated.
 * So it is a toggle rather than two lines — which is also how Braacket presents
 * it.
 */
const RankingHistoryChart: React.FC<Props> = ({ history, rankingName }) => {
  const [series, setSeries] = useState<Series>('rating')

  if (history.length === 0) {
    return <p>No history in {rankingName} yet.</p>
  }

  const showingRank = series === 'rank'

  /**
   * A single tournament draws no line, so the dot is enlarged to carry the plot
   * on its own. Showing one point beats hiding it: it is still where the player
   * stood, and the chart appearing from the first result reads better than a
   * placeholder that vanishes later.
   */
  const lone = history.length === 1

  return (
    <>
      <div className="segmented">
        <button type="button" onClick={() => setSeries('rating')} disabled={!showingRank}>
          Rating
        </button>
        <button type="button" onClick={() => setSeries('rank')} disabled={showingRank}>
          Rank
        </button>
      </div>

      {/* Height is fixed because the container has no intrinsic one to fill. */}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={history} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-6, #ddd)" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 12 }}
              width={48}
              allowDecimals={false}
              /** Rank 1 belongs at the top, so that axis runs backwards. */
              reversed={showingRank}
              domain={showingRank ? [1, 'dataMax'] : ['auto', 'auto']}
            />
            <Tooltip
              formatter={(value) => [showingRank ? `#${value}` : String(value), label(series)]}
            />
            <Line
              type="monotone"
              dataKey={series}
              name={label(series)}
              stroke="var(--gray-12, #111)"
              strokeWidth={2}
              dot={{ r: lone ? 5 : 2 }}
              activeDot={{ r: lone ? 6 : 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function label(series: Series): string {
  return series === 'rank' ? 'Rank' : 'Rating'
}

export default RankingHistoryChart
