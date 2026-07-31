import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

const LIB_BOUNDARY =
  'app/lib must not reach into the application. A module that needs the database, the queue, config or the request lifecycle belongs in app/services as a *Service.'

export default [
  ...configApp(...react),

  /**
   * `app/lib` holds modules that do not reach into the application: everything
   * they need arrives as an argument. Enforcing that here keeps the boundary
   * from eroding one convenient import at a time, and keeps the dependency
   * direction one-way — services may use lib, never the reverse.
   */
  {
    files: ['app/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Matched by regex, not by glob: minimatch reads a leading `#` as
              // a comment, so a `#models/**` group would silently match nothing.
              regex: '^#(models|services|jobs|config|start|database)/',
              message: LIB_BOUNDARY,
            },
            {
              group: [
                '@adonisjs/lucid',
                '@adonisjs/lucid/**',
                '@adonisjs/core/services/**',
                '@adonisjs/core/http',
                '@adonisjs/queue',
                '@adonisjs/queue/**',
              ],
              message: LIB_BOUNDARY,
            },
          ],
        },
      ],
    },
  },
]
