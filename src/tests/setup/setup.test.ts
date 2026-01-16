import {
  cleanupDatabase,
  createTestHabit,
  createTestUser,
} from './dbHelpers.ts'

describe('setup', () => {
  test('it should create a test user', async () => {
    const { user, token } = await createTestUser()

    expect(user).toBeDefined()
    expect(token).toBeDefined()

    await cleanupDatabase()
  })

  // test('it should create a test habit', async () => {
  //     const habit = await createTestHabit();
  //     expect(habit).toBeDefined();
  // })
})
