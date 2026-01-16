import { db } from '../../db/connection.ts'
import { users, habits, tags, entries, habitTags } from '../../db/schema.ts'
import { sql } from 'drizzle-orm'
import { execSync } from 'child_process'

export default async function setup() {
  console.log('🧑‍💻 Setting up the test db')
  try {
    await db.execute(sql`DROP TABLE IF EXISTS ${habits} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${entries} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${tags} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${users} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${habitTags} CASCADE`)

    console.log('🚀 Pushing schema using drizzle-kit push...')
    execSync(
      `npx drizzle-kit push --url="${process.env.DATABASE_URL}" --schema="./src/db/schema.ts" --dialect="postgresql"`,
      { stdio: 'inherit', cwd: process.cwd() }
    )

    console.log('✅ Test db setup complete')
  } catch (err) {
    console.error('❌ Error setting up test db', err)
    throw err
  }

  // Cleanup function
  return async () => {
    try {
      await db.execute(sql`DROP TABLE IF EXISTS ${habits} CASCADE`)
      await db.execute(sql`DROP TABLE IF EXISTS ${entries} CASCADE`)
      await db.execute(sql`DROP TABLE IF EXISTS ${tags} CASCADE`)
      await db.execute(sql`DROP TABLE IF EXISTS ${users} CASCADE`)
      await db.execute(sql`DROP TABLE IF EXISTS ${habitTags} CASCADE`)
      process.exit(0)
    } catch (err) {
      console.error('❌ Error cleaning up test db', err)
      throw err
    }
  }
}
