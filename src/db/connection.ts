import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env, isProd } from '../../env.ts'
import * as schema from './schema.ts'
import { remember } from '@epic-web/remember'

const createPool = () => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
  })
  return pool
}

let client: unknown

if (isProd()) {
  client = createPool()
} else {
  client = remember('dbPool', () => createPool())
}

export const db = drizzle(client, { schema })

export default db
