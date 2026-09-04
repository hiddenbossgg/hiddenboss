import '@adonisjs/inertia/types'

import type React from 'react'
import type { Prettify } from '@adonisjs/core/types/common'

type ExtractProps<T> =
  T extends React.FC<infer Props>
    ? Prettify<Omit<Props, 'children'>>
    : T extends React.Component<infer Props>
      ? Prettify<Omit<Props, 'children'>>
      : never

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'auth/forgot_password': ExtractProps<(typeof import('../../inertia/pages/auth/forgot_password.tsx'))['default']>
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.tsx'))['default']>
    'auth/reset_password': ExtractProps<(typeof import('../../inertia/pages/auth/reset_password.tsx'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'home': ExtractProps<(typeof import('../../inertia/pages/home.tsx'))['default']>
    'leagues/create': ExtractProps<(typeof import('../../inertia/pages/leagues/create.tsx'))['default']>
    'leagues/credentials': ExtractProps<(typeof import('../../inertia/pages/leagues/credentials.tsx'))['default']>
    'leagues/event_not_found': ExtractProps<(typeof import('../../inertia/pages/leagues/event_not_found.tsx'))['default']>
    'leagues/event': ExtractProps<(typeof import('../../inertia/pages/leagues/event.tsx'))['default']>
    'leagues/events': ExtractProps<(typeof import('../../inertia/pages/leagues/events.tsx'))['default']>
    'leagues/h2h': ExtractProps<(typeof import('../../inertia/pages/leagues/h2h.tsx'))['default']>
    'leagues/imports': ExtractProps<(typeof import('../../inertia/pages/leagues/imports.tsx'))['default']>
    'leagues/index': ExtractProps<(typeof import('../../inertia/pages/leagues/index.tsx'))['default']>
    'leagues/player_not_found': ExtractProps<(typeof import('../../inertia/pages/leagues/player_not_found.tsx'))['default']>
    'leagues/player': ExtractProps<(typeof import('../../inertia/pages/leagues/player.tsx'))['default']>
    'leagues/players_merge': ExtractProps<(typeof import('../../inertia/pages/leagues/players_merge.tsx'))['default']>
    'leagues/players': ExtractProps<(typeof import('../../inertia/pages/leagues/players.tsx'))['default']>
    'leagues/ranking_create': ExtractProps<(typeof import('../../inertia/pages/leagues/ranking_create.tsx'))['default']>
    'leagues/ranking_edit': ExtractProps<(typeof import('../../inertia/pages/leagues/ranking_edit.tsx'))['default']>
    'leagues/ranking_not_found': ExtractProps<(typeof import('../../inertia/pages/leagues/ranking_not_found.tsx'))['default']>
    'leagues/ranking': ExtractProps<(typeof import('../../inertia/pages/leagues/ranking.tsx'))['default']>
    'leagues/rankings': ExtractProps<(typeof import('../../inertia/pages/leagues/rankings.tsx'))['default']>
    'leagues/settings': ExtractProps<(typeof import('../../inertia/pages/leagues/settings.tsx'))['default']>
    'leagues/show': ExtractProps<(typeof import('../../inertia/pages/leagues/show.tsx'))['default']>
  }
}
