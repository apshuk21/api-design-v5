import { de } from 'zod/locales'
import { db } from '../../db/connection.ts'
import {
  users,
  habits,
  tags,
  entries,
  habitTags,
  type NewUser,
  type NewHabit,
  type NewTag,
} from '../../db/schema.ts'
import { generateToken } from '../../utils/jwt.ts'
import { hashPassword } from '../../utils/passwords.ts'

export const createTestUser = async (userData: Partial<NewUser> = {}) => {
  const defaultUser = {
    username: `testuser-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`,
    email: `test-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}@example.com`,
    password: 'adminPassword123',
    firstName: 'Test',
    lasName: 'User',
    ...userData,
  }

  const hashedPassword = await hashPassword(defaultUser.password)

  const [user] = await db
    .insert(users)
    .values({ ...defaultUser, password: hashedPassword })
    .returning()

  const token = generateToken({
    id: user.id,
    username: user.username,
    email: user.email,
  })

  return { user, token, rawPassword: defaultUser.password }
}

export const createTestHabit = async (
  userId: string,
  habitData: Partial<NewHabit>
) => {
  const defaultHabit = {
    name: `Test Habit ${Date.now()}`,
    description: 'Test habit description',
    frequency: 'daily',
    ...habitData,
  }

  const [habit] = await db
    .insert(habits)
    .values({ ...defaultHabit, userId })
    .returning()

  return habit
}

export const cleanupDatabase = async () => {
  await db.delete(habits)
  await db.delete(entries)
  await db.delete(tags)
  await db.delete(users)
  await db.delete(habitTags)
}
