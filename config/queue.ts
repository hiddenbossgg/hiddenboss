import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/queue'

export default defineConfig({
  default: env.get('QUEUE_DRIVER', 'database'),

  adapters: {
    /**
     * Postgres-backed rather than Redis: our throughput is dozens of jobs an
     * hour, and requiring Redis would add a third service to every self-hosted
     * install to solve a problem we do not have.
     */
    database: drivers.database({
      connectionName: 'pg',
    }),
    sync: drivers.sync(),
  },

  worker: {
    concurrency: 5,
    idleDelay: '2s',
  },

  locations: ['./app/jobs/**/*.{ts,js}'],
})
