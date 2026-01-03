# Email Uniqueness Verification Strategies for Large User Bases

## Context
- Database with 1 million+ users
- Email must be unique per user
- Need efficient verification during registration

## Recommended Strategy: Database Unique Constraint + Index

### 1. **Primary Defense: Database-Level Unique Constraint**

This is the **most critical** and **non-negotiable** layer:

```sql
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);
-- or
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
```

**Why this is essential:**
- **Race condition protection**: Prevents duplicate emails even with concurrent registrations
- **Data integrity**: Database enforces uniqueness regardless of application logic
- **Single source of truth**: Cannot be bypassed by buggy code or multiple app instances
- **Performance**: Index makes lookups O(log n) instead of O(n)

**Performance with 1M records:**
- B-tree index lookup: ~20 disk seeks (log₂ 1,000,000 ≈ 20)
- Query time: < 10ms typically

### 2. **Application-Level Check (Secondary Defense)**

Before attempting INSERT, check if email exists. There are multiple approaches with different performance characteristics.

#### Performance Comparison of Existence Check Methods

| Method | Data Returned | Performance | Memory Usage | Best For |
|--------|---------------|-------------|--------------|----------|
| `findUnique()` | Full user object | ~10ms | High | When you need user data |
| `findUnique({ select: { id } })` | Just ID | ~8ms | Low | Simple existence check |
| `count()` | Integer (0 or 1) | ~5ms | Minimal | **Recommended** for existence |
| `EXISTS` query | Boolean | ~3ms | Minimal | **Fastest** existence check |

**Key Performance Factor:** All methods are efficient (~3-10ms for 1M users) **IF AND ONLY IF** you have a unique index on the email column. Without an index, all methods become slow (~500ms+) due to full table scans.

#### Option 1: Using `count()` (Recommended for ORMs)

**Prisma:**
```typescript
const emailTaken = await prisma.user.count({
  where: { email: payload.email }
}) > 0

if (emailTaken) {
  throw new ConflictError('Email already registered')
}
```

**Drizzle ORM:**
```typescript
import { eq, count } from 'drizzle-orm'
import { db } from './db'
import { users } from './schema'

const result = await db
  .select({ count: count() })
  .from(users)
  .where(eq(users.email, payload.email))

if (result[0].count > 0) {
  throw new ConflictError('Email already registered')
}
```

#### Option 2: Using `findUnique/findFirst` with Minimal Selection

**Prisma:**
```typescript
const existingUser = await prisma.user.findUnique({
  where: { email: payload.email },
  select: { id: true } // Only select id for efficiency
})

if (existingUser) {
  throw new ConflictError('Email already registered')
}
```

**Drizzle ORM:**
```typescript
import { eq } from 'drizzle-orm'
import { db } from './db'
import { users } from './schema'

const existingUser = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, payload.email))
  .limit(1)

if (existingUser.length > 0) {
  throw new ConflictError('Email already registered')
}
```

#### Option 3: Raw SQL `EXISTS` Query (Maximum Performance)

**Prisma:**
```typescript
const [result] = await prisma.$queryRaw<[{ exists: boolean }]>`
  SELECT EXISTS(
    SELECT 1 FROM users WHERE email = ${payload.email}
  ) as exists
`

if (result.exists) {
  throw new ConflictError('Email already registered')
}
```

**Drizzle ORM:**
```typescript
import { sql, eq } from 'drizzle-orm'
import { db } from './db'
import { users } from './schema'

const result = await db.execute<{ exists: boolean }>(
  sql`SELECT EXISTS(SELECT 1 FROM users WHERE email = ${payload.email}) as exists`
)

if (result.rows[0].exists) {
  throw new ConflictError('Email already registered')
}
```

**Benefits:**
- Better user experience (specific error message)
- Prevents unnecessary INSERT attempt
- Can provide helpful feedback ("Email taken, did you forget your password?")

**Limitations:**
- Race condition window between check and INSERT
- Should NOT be relied upon as sole verification

#### Anti-Patterns: Inefficient Existence Checks

```typescript
// ❌ SLOW: Fetches all user data (unnecessary memory and network transfer)
const user = await prisma.user.findUnique({
  where: { email: payload.email }
  // No select: returns all fields including password hash, etc.
})

// ❌ VERY SLOW: Using findMany instead of findUnique (doesn't leverage unique index)
const users = await prisma.user.findMany({
  where: { email: payload.email }
})

// ❌ CATASTROPHIC: Client-side filtering
const allUsers = await prisma.user.findMany() // Loads 1M users into memory!
const exists = allUsers.some(u => u.email === payload.email)
```

### 3. **Handle Database Constraint Violations**

Always catch and handle unique constraint errors:

```typescript
try {
  const user = await db.user.create({ data: payload })
  return user
} catch (error) {
  // PostgreSQL: error.code === '23505'
  // MySQL: error.code === 'ER_DUP_ENTRY'
  // SQLite: error.code === 'SQLITE_CONSTRAINT'
  if (isUniqueConstraintError(error, 'email')) {
    throw new ConflictError('Email already registered')
  }
  throw error
}
```

## Performance Optimization Strategies

### 1. **Case-Insensitive Uniqueness**

Emails are case-insensitive per RFC 5321:

**Option A: Normalize on Insert**
```typescript
const normalizedEmail = email.toLowerCase().trim()
// Store normalized version
```

**Option B: Case-Insensitive Index (PostgreSQL)**
```sql
CREATE UNIQUE INDEX idx_users_email_unique ON users(LOWER(email));
```

**Option C: Collation (MySQL)**
```sql
ALTER TABLE users MODIFY email VARCHAR(255)
  COLLATE utf8mb4_unicode_ci UNIQUE;
```

### 2. **Partial Index for Soft Deletes**

If you soft-delete users:

```sql
-- PostgreSQL
CREATE UNIQUE INDEX idx_users_email_active
ON users(email) WHERE deleted_at IS NULL;

-- Allows same email to be reused after deletion
```

### 3. **Database-Specific Optimizations**

**PostgreSQL:**
- Use `SELECT 1 FROM users WHERE email = $1 LIMIT 1` for existence check
- Consider `ON CONFLICT DO NOTHING` for idempotent operations

**MySQL:**
- Ensure email column is VARCHAR(255) with index
- Use `SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)` for boolean check

**MongoDB:**
```javascript
db.users.createIndex({ email: 1 }, { unique: true })
```

## Anti-Patterns to Avoid

### ❌ **Application-Only Validation**
```typescript
// WRONG: No database constraint
const count = await db.user.count({ where: { email } })
if (count > 0) throw new Error('Email taken')
```
**Problem**: Race conditions with concurrent requests

### ❌ **Full Table Scan**
```sql
-- WRONG: No index on email
SELECT * FROM users WHERE email = 'user@example.com';
```
**Problem**: O(n) performance, scans all 1M rows

### ❌ **SELECT * for Existence Check**
```typescript
// WRONG: Fetches all user data
const user = await db.user.findUnique({ where: { email } })
```
**Better**: Only select what you need (`select: { id: true }`)

## Complete Implementation Examples

### Using Prisma ORM

```typescript
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

interface RegistrationData {
  email: string
  username: string
  password: string
}

export async function registerUser(data: RegistrationData) {
  // Normalize email
  const normalizedEmail = data.email.toLowerCase().trim()

  try {
    // Application-level check (optional, for better UX)
    const emailTaken = await prisma.user.count({
      where: { email: normalizedEmail }
    }) > 0

    if (emailTaken) {
      throw new ConflictError('Email already registered')
    }

    // Create user (database constraint is final authority)
    const user = await prisma.user.create({
      data: {
        ...data,
        email: normalizedEmail
      }
    })

    return user

  } catch (error) {
    // Handle unique constraint violation
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Prisma unique constraint violation
        const field = error.meta?.target as string[]
        if (field?.includes('email')) {
          throw new ConflictError('Email already registered')
        }
      }
    }
    throw error
  }
}
```

### Using Drizzle ORM on PostgreSQL

```typescript
import { eq, count } from 'drizzle-orm'
import { db } from './db'
import { users } from './schema'
import { PostgresError } from 'postgres'

interface RegistrationData {
  email: string
  username: string
  password: string
}

export async function registerUser(data: RegistrationData) {
  // Normalize email
  const normalizedEmail = data.email.toLowerCase().trim()

  try {
    // Application-level check (optional, for better UX)
    const result = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.email, normalizedEmail))

    if (result[0].count > 0) {
      throw new ConflictError('Email already registered')
    }

    // Create user (database constraint is final authority)
    const [user] = await db
      .insert(users)
      .values({
        ...data,
        email: normalizedEmail
      })
      .returning()

    return user

  } catch (error) {
    // Handle unique constraint violation
    // PostgreSQL error code 23505 = unique_violation
    if (error instanceof PostgresError && error.code === '23505') {
      if (error.constraint_name?.includes('email')) {
        throw new ConflictError('Email already registered')
      }
    }
    throw error
  }
}
```

### Drizzle Schema Example (PostgreSQL)

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(), // unique() creates index automatically
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// For case-insensitive email uniqueness
import { index, sql } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Case-insensitive unique index on email
  emailUniqueIdx: index('email_unique_idx')
    .on(sql`LOWER(${table.email})`)
    .unique(),
}))
```

## Database Migration Example

**Prisma Schema:**
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}
```

**Raw SQL Migration:**
```sql
-- Add unique constraint and index in one operation
ALTER TABLE users
  ADD CONSTRAINT users_email_unique UNIQUE (email);

-- For case-insensitive (PostgreSQL)
CREATE UNIQUE INDEX idx_users_email_lower
  ON users(LOWER(email));
```

## Performance Benchmarks (Approximate)

| Strategy | 1M Users | 10M Users | Notes |
|----------|----------|-----------|-------|
| No index | ~500ms | ~5000ms | Full table scan |
| B-tree index | ~5ms | ~8ms | Logarithmic scaling |
| Hash index | ~2ms | ~2ms | PostgreSQL only, equality checks |

## Additional Security Considerations

1. **Email Enumeration Protection**: Consider returning generic "Email or password incorrect" messages
2. **Rate Limiting**: Prevent brute-force email discovery
3. **Email Verification**: Send confirmation email before account activation
4. **Disposable Email Detection**: Block temporary email services if needed

## Summary

**Layered Approach (Defense in Depth):**

1. ✅ **Database unique constraint** (MUST HAVE)
2. ✅ **Indexed email column** (MUST HAVE for performance)
3. ✅ **Application-level check** (SHOULD HAVE for UX)
4. ✅ **Proper error handling** (MUST HAVE)
5. ✅ **Email normalization** (SHOULD HAVE)

The database constraint is your **last line of defense** and the only truly reliable way to prevent duplicates at scale.
