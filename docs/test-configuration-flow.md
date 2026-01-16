# Vitest Configuration Flow - Complete Guide

## Overview

This document explains the complete code flow when running `npm test` in the Habit Tracker API project, detailing how all configuration files and setup scripts work together.

---

## Table of Contents

1. [Command Entry Point](#1-command-entry-point)
2. [Environment Variable Setup](#2-environment-variable-setup)
3. [Vitest Configuration](#3-vitest-configuration)
4. [Global Setup Execution](#4-global-setup-execution)
5. [Database Connection](#5-database-connection)
6. [Test Helper Functions](#6-test-helper-functions)
7. [Test Execution](#7-test-execution)
8. [Cleanup and Teardown](#8-cleanup-and-teardown)
9. [Complete Flow Diagram](#9-complete-flow-diagram)

---

## 1. Command Entry Point

### package.json

When you run `npm test`, the following script is executed:

```json
"test": "cross-env APP_STAGE=test vitest run"
```

### What happens here:

1. **cross-env**: Sets environment variables in a cross-platform way (works on Windows, Mac, Linux)
2. **APP_STAGE=test**: Sets the `APP_STAGE` environment variable to `"test"` BEFORE anything else runs
3. **vitest run**: Executes Vitest in run mode (non-watch mode)

**Key Point**: The `APP_STAGE=test` variable is set FIRST, which is crucial for the env.ts file to load the correct environment configuration.

---

## 2. Environment Variable Setup

### env.ts

After the command sets `APP_STAGE=test`, the [env.ts](../env.ts) file is loaded by the application.

#### Step-by-step flow:

```typescript
// Line 4: Check if APP_STAGE is already set (it is, from package.json)
process.env.APP_STAGE = process.env.APP_STAGE || 'dev'

// Lines 6-8: Determine which environment we're in
const isProduction = process.env.APP_STAGE === 'production'  // false
const isDevelopment = process.env.APP_STAGE === 'dev'        // false
const isTesting = process.env.APP_STAGE === 'test'           // TRUE
```

#### Loading the correct .env file:

```typescript
// Lines 10-14: Load environment file based on APP_STAGE
if (isDevelopment) {
  loadEnv()           // Would load .env
} else if (isTesting) {
  loadEnv('test')     // Loads .env.test - THIS IS WHAT HAPPENS
}
```

**The `loadEnv('test')` function from `custom-env` does the following:**
- Looks for a file named `.env.test` in the project root
- Loads all variables from `.env.test` into `process.env`

### .env.test

The [.env.test](../.env.test) file contains test-specific configuration:

```bash
DATABASE_URL=postgresql://...           # Test database connection
PORT=3001                               # Test server port
NODE_ENV=test                           # Node environment
APP_STAGE=test                          # App stage (redundant but explicit)
JWT_SECRET=test_super_secret_jwt_key... # Test JWT secret
# ... other test-specific values
```

#### Validation with Zod:

After loading `.env.test`, the env.ts file validates all environment variables using Zod schema:

```typescript
// Lines 18-30: Define expected environment variable schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_STAGE: z.enum(['dev', 'test', 'production']).default('dev'),
  PORT: z.coerce.number().positive().default(3000),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32, 'Must be 32 chars long'),
  // ...
})

// Lines 35-36: Parse and validate
env = envSchema.parse(process.env)
```

**If validation fails:**
- Detailed error messages are logged
- The process exits with code 1 (Lines 54)
- This prevents tests from running with invalid configuration

**If validation succeeds:**
- The `env` object contains type-safe, validated environment variables
- This object is exported and used throughout the application

---

## 3. Vitest Configuration

### vitest.config.ts

Vitest reads the [vitest.config.ts](../vitest.config.ts) file to configure the test environment.

```typescript
export default defineConfig({
  test: {
    // Line 5: Enable global test functions (describe, it, expect)
    globals: true,

    // Line 6: Run global setup BEFORE any tests
    globalSetup: ['./src/tests/setup/globalSetup.ts'],

    // Lines 8-9: Clean up mocks between tests
    clearMocks: true,
    restoreMocks: true,

    // Lines 11-16: Run tests sequentially (one at a time)
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,  // Prevents database conflicts
      },
    },
  },
})
```

### Key configurations explained:

1. **globals: true**
   - Makes test functions like `describe`, `test`, `expect` available globally
   - No need to import them in test files

2. **globalSetup**
   - Points to [src/tests/setup/globalSetup.ts](../src/tests/setup/globalSetup.ts)
   - This file runs ONCE before ALL tests
   - Perfect for database setup/teardown

3. **singleThread: true**
   - Forces tests to run one at a time
   - Prevents race conditions in database operations
   - Critical for tests that modify shared database state

---

## 4. Global Setup Execution

### src/tests/setup/globalSetup.ts

This file exports a default function that Vitest calls BEFORE running any tests.

#### Step-by-step execution:

```typescript
export default async function setup() {
  console.log('🧑‍💻 Setting up the test db')

  try {
    // STEP 1: Drop all existing tables (Lines 9-13)
    await db.execute(sql`DROP TABLE IF EXISTS ${habits} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${entries} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${tags} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${users} CASCADE`)
    await db.execute(sql`DROP TABLE IF EXISTS ${habitTags} CASCADE`)
```

**Why drop tables?**
- Ensures a clean slate for every test run
- Removes any leftover data from previous test runs
- `CASCADE` removes dependent objects (foreign keys, etc.)

```typescript
    // STEP 2: Recreate tables from schema (Lines 15-19)
    console.log('🚀 Pushing schema using drizzle-kit push...')
    execSync(
      `npx drizzle-kit push --url="${process.env.DATABASE_URL}" --schema="./src/db/schema.ts" --dialect="postgresql"`,
      { stdio: 'inherit', cwd: process.cwd() }
    )
```

**What does drizzle-kit push do?**
- Reads the schema from [src/db/schema.ts](../src/db/schema.ts)
- Connects to the database using `DATABASE_URL` from `.env.test`
- Creates all tables, columns, indexes, and constraints
- This is an INTROSPECTIVE operation - it syncs the database to match the schema

```typescript
    console.log('✅ Test db setup complete')
  } catch (err) {
    console.error('❌ Error setting up test db', err)
    throw err  // Stops test execution if setup fails
  }
```

#### Return value (Cleanup function):

```typescript
  // Lines 28-40: Return a cleanup function
  return async () => {
    try {
      // Drop all tables after ALL tests complete
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
```

**When does the cleanup function run?**
- AFTER all tests have completed
- Vitest automatically calls this returned function
- It drops all tables again to leave the database clean

---

## 5. Database Connection

### src/db/connection.ts

The database connection is established using the validated environment variables.

```typescript
import { env, isProd } from '../../env.ts'

const createPool = () => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,  // From .env.test
  })
  return pool
}

let client: unknown

if (isProd()) {
  client = createPool()
} else {
  // In test mode, use @epic-web/remember to prevent connection leaks
  client = remember('dbPool', () => createPool())
}

export const db = drizzle(client, { schema })
```

**Why use `remember()` in non-production?**
- During development and testing, hot-reloading can cause multiple imports
- `remember()` ensures only ONE connection pool is created
- It caches the pool with key `'dbPool'` across module reloads
- In production, no hot-reloading occurs, so direct creation is fine

**The `db` object is used everywhere:**
- In globalSetup.ts to drop/create tables
- In test helper functions to create test data
- In actual tests to query the database

---

## 6. Test Helper Functions

### src/tests/setup/dbHelpers.ts

These helper functions make it easy to create test data.

#### createTestUser()

```typescript
export const createTestUser = async (userData: Partial<NewUser> = {}) => {
  // Generate unique username and email using timestamp + random string
  const defaultUser = {
    username: `testuser-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
    password: 'adminPassword123',
    firstName: 'Test',
    lasName: 'User',
    ...userData,  // Allow overriding defaults
  }

  // Hash the password before storing
  const hashedPassword = await hashPassword(defaultUser.password)

  // Insert into database and return the created user
  const [user] = await db
    .insert(users)
    .values({ ...defaultUser, password: hashedPassword })
    .returning()

  // Generate JWT token for authentication in tests
  const token = generateToken({
    id: user.id,
    username: user.username,
    email: user.email,
  })

  return { user, token, rawPassword: defaultUser.password }
}
```

**Usage in tests:**
- Creates a user with unique credentials (no collisions)
- Returns both the user object and a valid JWT token
- Token can be used in `Authorization` headers for API tests
- `rawPassword` is returned for login tests

#### createTestHabit()

```typescript
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
```

**Usage in tests:**
- Creates a habit linked to a user
- Unique name prevents collisions
- Allows customization via `habitData` parameter

#### cleanupDatabase()

```typescript
export const cleanupDatabase = async () => {
  await db.delete(habits)
  await db.delete(entries)
  await db.delete(tags)
  await db.delete(users)
  await db.delete(habitTags)
}
```

**Usage in tests:**
- Clears all data from ALL tables
- Should be called in `afterEach()` or at the end of tests
- Ensures test isolation (each test starts with empty tables)

---

## 7. Test Execution

### src/tests/setup/setup.test.ts

This is an example test file showing how everything works together.

```typescript
import {
  cleanupDatabase,
  createTestHabit,
  createTestUser,
} from './dbHelpers.ts'

describe('setup', () => {
  test('it should create a test user', async () => {
    // Use helper to create a test user
    const { user, token } = await createTestUser()

    // Assert the user and token were created
    expect(user).toBeDefined()
    expect(token).toBeDefined()

    // Clean up after the test
    await cleanupDatabase()
  })
})
```

**Test execution order:**

1. **Before ANY tests**: `globalSetup.ts` runs
   - Database tables are dropped
   - Schema is pushed to recreate tables
   - Database is now empty and ready

2. **For each test file**: Vitest loads the file
   - Imports are resolved
   - `describe` and `test` blocks are registered

3. **For each test**:
   - Test function executes
   - Can use helper functions to create data
   - Assertions are checked
   - Cleanup can be done manually or in `afterEach()`

4. **After ALL tests**: Cleanup function from `globalSetup.ts` runs
   - All tables are dropped
   - Database is left clean

---

## 8. Cleanup and Teardown

### Test Isolation Strategies

There are two approaches to cleanup in this setup:

#### Approach 1: Manual cleanup in each test

```typescript
test('it should create a test user', async () => {
  const { user, token } = await createTestUser()

  expect(user).toBeDefined()
  expect(token).toBeDefined()

  await cleanupDatabase()  // Clean up at the end
})
```

**Pros:**
- Explicit control
- Easy to see what's being cleaned

**Cons:**
- Easy to forget
- Duplicated cleanup code

#### Approach 2: Using afterEach hook

```typescript
describe('setup', () => {
  afterEach(async () => {
    await cleanupDatabase()
  })

  test('it should create a test user', async () => {
    const { user, token } = await createTestUser()

    expect(user).toBeDefined()
    expect(token).toBeDefined()
    // No manual cleanup needed
  })

  test('it should create a test habit', async () => {
    const { user } = await createTestUser()
    const habit = await createTestHabit(user.id, {})

    expect(habit).toBeDefined()
    // No manual cleanup needed
  })
})
```

**Pros:**
- DRY (Don't Repeat Yourself)
- Automatic cleanup after every test
- Impossible to forget

**Cons:**
- Less explicit
- Cleanup runs even if test throws an error (usually desired)

---

## 9. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. COMMAND EXECUTION                                            │
│    $ npm test                                                   │
│    → cross-env APP_STAGE=test vitest run                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ENVIRONMENT SETUP (env.ts)                                   │
│    • APP_STAGE is already set to 'test'                         │
│    • isTesting = true                                           │
│    • loadEnv('test') loads .env.test file                       │
│    • Zod validates all environment variables                    │
│    • env object is created with type-safe values                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. VITEST CONFIGURATION (vitest.config.ts)                      │
│    • Reads configuration                                        │
│    • Sets globals: true                                         │
│    • Sets singleThread: true                                    │
│    • Registers globalSetup file path                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. GLOBAL SETUP (src/tests/setup/globalSetup.ts)               │
│    • Imports db from connection.ts                              │
│    • db uses env.DATABASE_URL from .env.test                    │
│    • DROP all existing tables (CASCADE)                         │
│    • Run drizzle-kit push to recreate schema                    │
│    • Return cleanup function for teardown                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. DATABASE CONNECTION (src/db/connection.ts)                   │
│    • createPool() uses env.DATABASE_URL                         │
│    • remember() caches the pool (prevents leaks)                │
│    • drizzle() wraps the pool with ORM capabilities             │
│    • db object is exported                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. TEST FILE LOADING                                            │
│    • Vitest discovers *.test.ts files                           │
│    • Imports test helpers from dbHelpers.ts                     │
│    • Registers describe/test blocks                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. TEST EXECUTION (Sequential)                                  │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ Test 1:                                               │   │
│    │  • Call createTestUser()                              │   │
│    │  • createTestUser() uses db to INSERT                 │   │
│    │  • Assertions run                                     │   │
│    │  • cleanupDatabase() deletes all rows                 │   │
│    └───────────────────────────────────────────────────────┘   │
│                         │                                       │
│                         ▼                                       │
│    ┌───────────────────────────────────────────────────────┐   │
│    │ Test 2:                                               │   │
│    │  • Database is clean (from previous cleanup)          │   │
│    │  • Call createTestUser() and createTestHabit()        │   │
│    │  • Assertions run                                     │   │
│    │  • cleanupDatabase() deletes all rows                 │   │
│    └───────────────────────────────────────────────────────┘   │
│                         │                                       │
│                         ▼                                       │
│    └─── More tests... ───┘                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. GLOBAL TEARDOWN                                              │
│    • Cleanup function from globalSetup runs                     │
│    • DROP all tables again                                      │
│    • process.exit(0)                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Takeaways

### 1. Environment Management
- `cross-env` sets `APP_STAGE=test` FIRST
- `env.ts` detects this and loads `.env.test`
- Zod validates all required environment variables
- Type-safe `env` object is used throughout the app

### 2. Database Setup
- `globalSetup.ts` runs ONCE before all tests
- Drops existing tables and recreates from schema
- Uses the test database from `.env.test`
- Returns cleanup function for teardown

### 3. Test Isolation
- Tests run sequentially (`singleThread: true`)
- Each test can use helper functions to create data
- `cleanupDatabase()` ensures no data leaks between tests
- Tables are dropped completely after all tests finish

### 4. Database Connection
- `connection.ts` creates a connection pool
- `remember()` prevents connection leaks during development/testing
- `db` object provides Drizzle ORM capabilities
- Same `db` object used in setup, helpers, and tests

### 5. Helper Functions
- `createTestUser()` creates unique users with tokens
- `createTestHabit()` creates habits linked to users
- `cleanupDatabase()` deletes all data for test isolation
- Helpers use the shared `db` connection

---

## File Reference Quick Links

- [package.json](../package.json#L15) - Test command
- [vitest.config.ts](../vitest.config.ts) - Vitest configuration
- [env.ts](../env.ts) - Environment loading and validation
- [.env.test](../.env.test) - Test environment variables
- [src/tests/setup/globalSetup.ts](../src/tests/setup/globalSetup.ts) - Global test setup
- [src/tests/setup/dbHelpers.ts](../src/tests/setup/dbHelpers.ts) - Test helper functions
- [src/tests/setup/setup.test.ts](../src/tests/setup/setup.test.ts) - Example test file
- [src/db/connection.ts](../src/db/connection.ts) - Database connection

---

## Summary

When you run `npm test`:

1. **Environment is configured** with test-specific values from `.env.test`
2. **Database is wiped clean** and schema is recreated
3. **Tests run sequentially** one at a time to avoid conflicts
4. **Helper functions** create test data with unique values
5. **Cleanup** ensures each test starts with a clean database
6. **Final teardown** drops all tables after tests complete

This setup ensures:
- ✅ Tests are isolated (no data leakage)
- ✅ Tests are repeatable (same starting state)
- ✅ Tests are safe (use test database, not production)
- ✅ Tests are fast (sequential execution, shared connection pool)
