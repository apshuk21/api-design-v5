import { db } from './connection.ts'
import { users, habits, entries, tags, habitTags } from './schema.ts'

const seed = async () => {
  console.log('🌱 Starting database seed...')

  try {
    console.log('✅ Clearing existing data...')
    await db.delete(users)
    await db.delete(habits)
    await db.delete(entries)
    await db.delete(tags)
    await db.delete(habitTags)

    console.log('✅ Creating demo users...')
    const [demoUser] = await db
      .insert(users)
      .values([
        {
          email: 'abc@xyz.com',
          password: 'password',
          username: 'abc',
          firstName: 'abc',
          lastName: 'xyz',
        },
      ])
      .returning()

    console.log('🏷️ Creating tags....')
    const [healthTag] = await db
      .insert(tags)
      .values([
        {
          name: 'health',
          color: '#f0f0f0',
        },
      ])
      .returning()

    console.log('🏒 Creating habits....')
    const [exerciseHabit] = await db
      .insert(habits)
      .values([
        {
          userId: demoUser.id,
          name: 'Exercise',
          description: 'Exercise daily',
          frequency: 'daily',
          targetCount: 1,
        },
      ])
      .returning()

    await db.insert(habitTags).values([
      {
        habitId: exerciseHabit.id,
        tagId: healthTag.id,
      },
    ])

    console.log('📝 Creating entries....')

    const today = new Date()
    today.setHours(12, 0, 0, 0)

    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)

      await db.insert(entries).values([
        {
          habitId: exerciseHabit.id,
          note: 'Ran 5 miles',
          completionDate: date,
        },
      ])
    }

    console.log('🏋️‍♀️ Databases seeded successfully....')

    console.log(`Demo user email: ${demoUser.email}`)
    console.log(`Demo user password: ${demoUser.password}`)
    console.log(`Demo user username: ${demoUser.username}`)
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    process.exit(1)
  } finally {
    console.log('✅ Database seed complete!')
    process.exit(0)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

export default seed
