import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/**
 * Type mappings for the generated schema classes in `database/schema.ts`.
 *
 * Keys are the generator's own internal type names, not Postgres type names.
 * Registered via `schemaGeneration.rulesPaths` in `config/database.ts`; without
 * that entry this file is never loaded.
 */
export default {
  types: {
    /**
     * JSON columns hold structured configuration — ranking config, import
     * stats, observed capabilities. The default is `any`, which removes type
     * safety from exactly the columns most worth keeping honest.
     */
    json: { tsType: 'Record<string, any>' },
    jsonb: { tsType: 'Record<string, any>' },
  },

  columns: {
    /**
     * Slugs are `citext`, which the introspector does not recognise and so
     * types as `any`. Scoped to the column name rather than mapping all
     * unknown types to string, which would hide genuine gaps.
     */
    slug: { tsType: 'string' },
  },
} satisfies SchemaRules
