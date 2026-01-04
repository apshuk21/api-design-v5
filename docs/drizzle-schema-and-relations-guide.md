# Drizzle ORM Schema and Relations Guide

## Table of Contents
1. [Schema Overview](#schema-overview)
2. [Database Tables](#database-tables)
3. [Relations Deep Dive](#relations-deep-dive)
4. [Relation Analysis and Issues](#relation-analysis-and-issues)
5. [Controller Examples](#controller-examples)
6. [Common Query Patterns](#common-query-patterns)
7. [Best Practices](#best-practices)

---

## Schema Overview

This application uses **Drizzle ORM** with PostgreSQL to manage a habit tracking system. The schema consists of 5 main tables:

- **users**: User accounts
- **habits**: Habits created by users
- **entries**: Daily habit completion records
- **tags**: Categorization labels
- **habitTags**: Junction table for many-to-many relationship between habits and tags

### Entity Relationship Diagram (Text)

```
users (1) ──────< (many) habits
                     │
                     ├──< (many) entries
                     │
                     └──< (many) habitTags >──< (many) tags
```

---

## Database Tables

### 1. Users Table

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 50 }),
  lastName: varchar('last_name', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Purpose**: Stores user authentication and profile information.

**Key Features**:
- UUIDs for primary keys (better for distributed systems)
- Unique constraints on email and username
- Auto-generated timestamps
- Password stored as hashed string (should be bcrypt/argon2 hashed)

**Example Usage**:
```typescript
// Insert a new user
const [newUser] = await db.insert(users).values({
  email: 'john@example.com',
  username: 'johndoe',
  password: hashedPassword,
  firstName: 'John',
  lastName: 'Doe'
}).returning()
```

---

### 2. Habits Table

```typescript
export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  frequency: varchar('frequency', { length: 20 }).notNull(),
  targetCount: integer('target_count').default(1),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Purpose**: Stores habits that users want to track.

**Key Features**:
- Foreign key to users with `CASCADE` delete (when user is deleted, all habits are deleted)
- `frequency`: Could be 'daily', 'weekly', 'monthly', etc.
- `targetCount`: How many times per frequency period (e.g., 3 times daily)
- `isActive`: Soft delete/archive functionality

**Example Usage**:
```typescript
// Create a habit
await db.insert(habits).values({
  userId: 'user-uuid-here',
  name: 'Morning Exercise',
  description: '30 minutes of cardio',
  frequency: 'daily',
  targetCount: 1,
  isActive: true
})

// Archive a habit (soft delete)
await db.update(habits)
  .set({ isActive: false })
  .where(eq(habits.id, habitId))
```

---

### 3. Entries Table

```typescript
export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  habitId: uuid('habit_id')
    .notNull()
    .references(() => habits.id, { onDelete: 'cascade' }),
  note: text('note'),
  completionDate: timestamp('completion_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Purpose**: Records each time a user completes a habit.

**Key Features**:
- Linked to habits with CASCADE delete
- `completionDate`: When the habit was completed
- `note`: Optional user notes about the completion

**Example Usage**:
```typescript
// Log a habit completion
await db.insert(entries).values({
  habitId: 'habit-uuid-here',
  note: 'Felt great after this workout!',
  completionDate: new Date()
})

// Get all completions for a habit
const completions = await db.query.entries.findMany({
  where: eq(entries.habitId, habitId),
  orderBy: desc(entries.completionDate)
})
```

---

### 4. Tags Table

```typescript
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  color: varchar('color', { length: 7 }).default('#6b7280'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Purpose**: Stores reusable tags for categorizing habits.

**Key Features**:
- Unique tag names (global across all users)
- Color coding for visual organization (hex format: #RRGGBB)
- Shared tags across all users

**Example Usage**:
```typescript
// Create a tag
await db.insert(tags).values({
  name: 'Health',
  color: '#22c55e' // Green
})

// Get all tags
const allTags = await db.query.tags.findMany()
```

---

### 5. HabitTags Table (Junction Table)

```typescript
export const habitTags = pgTable('habit_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  habitId: uuid('habit_id')
    .notNull()
    .references(() => habits.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Purpose**: Links habits to tags (many-to-many relationship).

**Key Features**:
- CASCADE delete on both foreign keys
- Allows multiple tags per habit
- Allows same tag on multiple habits

**Example Usage**:
```typescript
// Add tags to a habit
await db.insert(habitTags).values([
  { habitId: 'habit-id', tagId: 'health-tag-id' },
  { habitId: 'habit-id', tagId: 'morning-tag-id' }
])
```

---

## Relations Deep Dive

Drizzle ORM uses the `relations()` function to define how tables relate to each other. This is separate from database foreign keys but essential for query building.

### 1. User Relations

```typescript
export const userRelations = relations(users, ({ many }) => ({
  habits: many(habits),
}))
```

**Explanation**:
- A user has **many** habits
- Relation name: `habits`
- Allows querying: `db.query.users.findMany({ with: { habits: true } })`

**Example Query**:
```typescript
// Get user with all their habits
const userWithHabits = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    habits: true
  }
})

// Result structure:
{
  id: 'user-id',
  email: 'user@example.com',
  habits: [
    { id: 'habit-1', name: 'Exercise', ... },
    { id: 'habit-2', name: 'Reading', ... }
  ]
}
```

---

### 2. Habit Relations

```typescript
export const habitRelations = relations(habits, ({ one, many }) => ({
  user: one(users, {
    fields: [habits.userId],
    references: [users.id],
  }),
  entries: many(entries),
  tags: many(habitTags),
}))
```

**Explanation**:
- **user**: A habit belongs to **one** user (many-to-one)
- **entries**: A habit has **many** completion entries
- **tags**: A habit has **many** habitTags (junction records)

**Example Query**:
```typescript
// Get habit with user, entries, and tags
const habit = await db.query.habits.findFirst({
  where: eq(habits.id, habitId),
  with: {
    user: true,           // Get the habit owner
    entries: true,        // Get all completion records
    tags: {              // Get junction records
      with: {
        tag: true        // Get actual tag data
      }
    }
  }
})

// Result structure:
{
  id: 'habit-id',
  name: 'Morning Exercise',
  user: { id: 'user-id', email: 'user@example.com', ... },
  entries: [
    { id: 'entry-1', completionDate: '2024-01-01', ... },
    { id: 'entry-2', completionDate: '2024-01-02', ... }
  ],
  tags: [
    {
      id: 'junction-1',
      habitId: 'habit-id',
      tagId: 'tag-1',
      tag: { id: 'tag-1', name: 'Health', color: '#22c55e' }
    }
  ]
}
```

---

### 3. Entry Relations

```typescript
export const entryRelations = relations(entries, ({ one }) => ({
  habit: one(habits, {
    fields: [entries.habitId],
    references: [habits.id],
  }),
}))
```

**Explanation**:
- An entry belongs to **one** habit

**Example Query**:
```typescript
// Get entry with its associated habit
const entry = await db.query.entries.findFirst({
  where: eq(entries.id, entryId),
  with: {
    habit: true
  }
})

// Result:
{
  id: 'entry-id',
  note: 'Great workout today!',
  habit: { id: 'habit-id', name: 'Morning Exercise', ... }
}
```

---

### 4. Tag Relations

```typescript
export const tagRelations = relations(tags, ({ many }) => ({
  habits: many(habitTags),
}))
```

**Explanation**:
- A tag has **many** habitTags (junction records)

**Example Query**:
```typescript
// Get tag with all habits using it
const tagWithHabits = await db.query.tags.findFirst({
  where: eq(tags.id, tagId),
  with: {
    habits: {
      with: {
        habit: true  // Get actual habit data
      }
    }
  }
})

// Result:
{
  id: 'tag-id',
  name: 'Health',
  habits: [
    {
      id: 'junction-1',
      tagId: 'tag-id',
      habitId: 'habit-1',
      habit: { id: 'habit-1', name: 'Exercise', ... }
    }
  ]
}
```

---

### 5. HabitTag Relations

```typescript
export const habitTagRelations = relations(habitTags, ({ one }) => ({
  habit: one(habits, {
    fields: [habitTags.habitId],
    references: [habits.id],
  }),
  tag: one(tags, {
    fields: [habitTags.tagId],
    references: [tags.id],
  }),
}))
```

**Explanation**:
- A habitTag junction record belongs to **one** habit
- A habitTag junction record belongs to **one** tag
- This enables traversing the many-to-many relationship

---

## Relation Analysis and Issues

### ✅ Correct Relations

1. **userRelations**: ✅ Correct
   - One user → Many habits

2. **habitRelations**: ✅ Correct
   - One habit → One user (inverse of user.habits)
   - One habit → Many entries
   - One habit → Many habitTags (junction)

3. **entryRelations**: ✅ Correct
   - One entry → One habit

4. **tagRelations**: ✅ Correct
   - One tag → Many habitTags (junction)

5. **habitTagRelations**: ✅ Correct
   - One habitTag → One habit
   - One habitTag → One tag

### 🚨 Potential Issues and Improvements

#### Issue 1: Incomplete User Relations
The user relations only define `habits` but not inverse relations for easier queries.

**Current**:
```typescript
export const userRelations = relations(users, ({ many }) => ({
  habits: many(habits),
}))
```

**Could be extended** (optional):
```typescript
export const userRelations = relations(users, ({ many }) => ({
  habits: many(habits),
  // Not strictly necessary but could be useful
}))
```

**Verdict**: Current implementation is fine. Adding more would be redundant since you can query through habits.

---

#### Issue 2: Tag System Design
Tags are **global** (unique constraint on name), meaning all users share the same tag pool. This might be intentional, but consider:

**Current Design**: Global tags
- Pro: Consistency, less duplication
- Con: One user can't have a personal "Important" tag if it already exists

**Alternative**: User-specific tags
```typescript
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  // ... rest
})
// Add unique constraint on (userId, name) combination
```

**Verdict**: Current design is fine if you want a shared tag system. If you want personal tags, you'll need to modify the schema.

---

## Controller Examples

### createHabit Function

```typescript
export async function createHabit(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, frequency, targetCount, tagIds, isActive } =
      req.body

    const result = await db.transaction(async (tx) => {
      // Step 1: Insert the habit
      const [habit] = await tx
        .insert(habits)
        .values({
          name,
          ...(description !== undefined && { description }),
          frequency,
          ...(targetCount !== undefined && { targetCount }),
          ...(isActive !== undefined && { isActive }),
          userId: req.user!.id,
        })
        .returning()

      // Step 2: Create junction records for tags
      if (tagIds && tagIds.length > 0) {
        await tx.insert(habitTags).values(
          tagIds.map((tagId: string) => ({
            habitId: habit.id,
            tagId,
          }))
        )
      }
      return habit
    })

    res.status(201).json({
      message: 'Habit created successfully',
      habit: result,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}
```

**How it works**:
1. Uses a **transaction** to ensure atomicity (all-or-nothing)
2. Creates habit record first
3. If tags provided, creates junction records linking habit to tags
4. Uses spread operator `...()` for optional fields
5. Uses `.returning()` to get the created habit back

**Example Request**:
```json
POST /api/habits
{
  "name": "Morning Meditation",
  "description": "10 minutes of mindfulness",
  "frequency": "daily",
  "targetCount": 1,
  "tagIds": ["tag-uuid-1", "tag-uuid-2"],
  "isActive": true
}
```

**Why use transactions?**
- If habit creation succeeds but tag linking fails, the habit is rolled back
- Ensures data consistency

---

### getUserHabits Function

```typescript
export const getUserHabits = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user!.id

    const userHabits = await db.query.habits.findMany({
      where: eq(habits.userId, userId),
      with: {
        tags: {           // Relation name from habitRelations
          with: {
            tag: true,    // Relation name from habitTagRelations
          },
        },
      },
    })

    res.status(200).json({
      message: 'Habits retrieved successfully',
      habits: userHabits,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}
```

**How it works**:
1. Gets authenticated user ID from `req.user` (set by auth middleware)
2. Queries habits where `userId` matches
3. Uses nested `with` to include:
   - `tags`: The habitTags junction records
   - `tag`: The actual tag data for each junction record

**Response Structure**:
```json
{
  "message": "Habits retrieved successfully",
  "habits": [
    {
      "id": "habit-uuid-1",
      "name": "Morning Exercise",
      "description": "30 min cardio",
      "frequency": "daily",
      "targetCount": 1,
      "isActive": true,
      "userId": "user-uuid",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "tags": [
        {
          "id": "junction-uuid-1",
          "habitId": "habit-uuid-1",
          "tagId": "tag-uuid-1",
          "tag": {
            "id": "tag-uuid-1",
            "name": "Health",
            "color": "#22c55e"
          }
        }
      ]
    }
  ]
}
```

---

## Common Query Patterns

### 1. Get User with All Habits and Their Tags

```typescript
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    habits: {
      with: {
        tags: {
          with: {
            tag: true
          }
        }
      }
    }
  }
})
```

---

### 2. Get Habit with Completion Stats

```typescript
const habitWithEntries = await db.query.habits.findFirst({
  where: eq(habits.id, habitId),
  with: {
    entries: {
      orderBy: desc(entries.completionDate),
      limit: 30  // Last 30 entries
    },
    tags: {
      with: {
        tag: true
      }
    }
  }
})

// Calculate completion rate
const completionCount = habitWithEntries.entries.length
```

---

### 3. Get All Habits with a Specific Tag

```typescript
// First, get the tag with all its habit associations
const tagWithHabits = await db.query.tags.findFirst({
  where: eq(tags.name, 'Health'),
  with: {
    habits: {
      with: {
        habit: {
          with: {
            user: true  // Include habit owner
          }
        }
      }
    }
  }
})

// Extract habits
const healthHabits = tagWithHabits?.habits.map(ht => ht.habit) || []
```

**Alternative using joins**:
```typescript
const healthHabits = await db
  .select({
    habit: habits,
    tag: tags,
  })
  .from(habits)
  .innerJoin(habitTags, eq(habits.id, habitTags.habitId))
  .innerJoin(tags, eq(habitTags.tagId, tags.id))
  .where(eq(tags.name, 'Health'))
```

---

### 4. Get Active Habits Only

```typescript
const activeHabits = await db.query.habits.findMany({
  where: and(
    eq(habits.userId, userId),
    eq(habits.isActive, true)
  ),
  with: {
    tags: {
      with: {
        tag: true
      }
    }
  }
})
```

---

### 5. Get Habits with Entry Count

```typescript
import { sql } from 'drizzle-orm'

const habitsWithCounts = await db
  .select({
    habit: habits,
    entryCount: sql<number>`count(${entries.id})::int`,
  })
  .from(habits)
  .leftJoin(entries, eq(habits.id, entries.habitId))
  .where(eq(habits.userId, userId))
  .groupBy(habits.id)
```

---

### 6. Add Entry and Return Updated Habit

```typescript
// Create entry
const [newEntry] = await db.insert(entries).values({
  habitId: habitId,
  note: 'Completed!',
  completionDate: new Date()
}).returning()

// Get updated habit with all entries
const updatedHabit = await db.query.habits.findFirst({
  where: eq(habits.id, habitId),
  with: {
    entries: {
      orderBy: desc(entries.completionDate)
    }
  }
})
```

---

### 7. Update Habit and Its Tags

```typescript
await db.transaction(async (tx) => {
  // Update habit
  await tx.update(habits)
    .set({ name: 'New Name', updatedAt: new Date() })
    .where(eq(habits.id, habitId))

  // Remove all existing tag associations
  await tx.delete(habitTags)
    .where(eq(habitTags.habitId, habitId))

  // Add new tag associations
  if (newTagIds.length > 0) {
    await tx.insert(habitTags).values(
      newTagIds.map(tagId => ({
        habitId: habitId,
        tagId: tagId
      }))
    )
  }
})
```

---

### 8. Delete Habit (Cascade Automatic)

```typescript
// This will automatically delete:
// - All entries for this habit (CASCADE)
// - All habitTags for this habit (CASCADE)
await db.delete(habits).where(eq(habits.id, habitId))
```

---

### 9. Get Habits by Multiple Tags (AND logic)

```typescript
// Get habits that have ALL specified tags
const tagIdsToFind = ['tag-1', 'tag-2']

const habitsWithAllTags = await db
  .select({
    habit: habits,
    tagCount: sql<number>`count(distinct ${habitTags.tagId})::int`,
  })
  .from(habits)
  .innerJoin(habitTags, eq(habits.id, habitTags.habitId))
  .where(
    and(
      eq(habits.userId, userId),
      inArray(habitTags.tagId, tagIdsToFind)
    )
  )
  .groupBy(habits.id)
  .having(sql`count(distinct ${habitTags.tagId}) = ${tagIdsToFind.length}`)
```

---

### 10. Get Today's Completions

```typescript
const today = new Date()
today.setHours(0, 0, 0, 0)

const todayEntries = await db.query.entries.findMany({
  where: and(
    eq(entries.habitId, habitId),
    sql`${entries.completionDate} >= ${today}`
  ),
  with: {
    habit: true
  }
})
```

---

## Best Practices

### 1. Always Use Transactions for Multi-Step Operations

```typescript
// ✅ Good
await db.transaction(async (tx) => {
  const [habit] = await tx.insert(habits).values({...}).returning()
  await tx.insert(habitTags).values([...])
})

// ❌ Bad
const [habit] = await db.insert(habits).values({...}).returning()
await db.insert(habitTags).values([...])  // If this fails, habit is still created
```

---

### 2. Use Type Inference

```typescript
// Drizzle provides excellent type inference
type User = typeof users.$inferSelect      // Select type (from DB)
type NewUser = typeof users.$inferInsert   // Insert type (to DB)

// Usage
const createUser = async (userData: NewUser) => {
  const [user] = await db.insert(users).values(userData).returning()
  return user  // Type is User
}
```

---

### 3. Use Relational Queries When Possible

```typescript
// ✅ Good - Clear and type-safe
const habit = await db.query.habits.findFirst({
  where: eq(habits.id, habitId),
  with: { tags: { with: { tag: true } } }
})

// ✅ Also good - More control
const habit = await db
  .select()
  .from(habits)
  .leftJoin(habitTags, eq(habits.id, habitTags.habitId))
  .where(eq(habits.id, habitId))
```

---

### 4. Handle Optional Fields Properly

```typescript
// ✅ Good - Only include if provided
const values = {
  name: req.body.name,
  ...(req.body.description && { description: req.body.description }),
}

// ❌ Bad - Sends undefined to database
const values = {
  name: req.body.name,
  description: req.body.description,  // Could be undefined
}
```

---

### 5. Use Prepared Statements for Repeated Queries

```typescript
// For queries executed frequently
const getUserHabits = db.query.habits.findMany({
  where: eq(habits.userId, sql.placeholder('userId')),
  with: { tags: { with: { tag: true } } }
}).prepare('get_user_habits')

// Execute with parameters
const habits = await getUserHabits.execute({ userId: 'user-id' })
```

---

### 6. Validate Foreign Keys Before Insertion

```typescript
// ✅ Good - Verify tags exist before creating associations
const existingTags = await db.query.tags.findMany({
  where: inArray(tags.id, tagIds)
})

if (existingTags.length !== tagIds.length) {
  throw new Error('Some tags do not exist')
}

await db.insert(habitTags).values(...)
```

---

### 7. Use Soft Deletes When Appropriate

```typescript
// Already implemented in schema with isActive
// Soft delete (archive)
await db.update(habits)
  .set({ isActive: false })
  .where(eq(habits.id, habitId))

// Hard delete
await db.delete(habits).where(eq(habits.id, habitId))
```

---

### 8. Index Foreign Keys for Performance

```typescript
// Add to schema for better query performance
export const habits = pgTable('habits', {
  // ... columns
}, (table) => ({
  userIdIdx: index('habits_user_id_idx').on(table.userId),
}))

export const entries = pgTable('entries', {
  // ... columns
}, (table) => ({
  habitIdIdx: index('entries_habit_id_idx').on(table.habitId),
}))
```

---

## Summary

### Schema Structure
- ✅ Well-designed normalized schema
- ✅ Proper foreign key constraints with CASCADE
- ✅ UUID primary keys
- ✅ Appropriate data types
- ✅ Timestamps for audit trail

### Relations
- ✅ All relations correctly defined
- ✅ Proper use of `one()` and `many()`
- ✅ Junction table properly configured for many-to-many

### Controller
- ✅ Uses transactions for data integrity
- ✅ Proper error handling
- ✅ Correct relational queries
- ⚠️ Could add input validation (Zod schemas)
- ⚠️ Could add more specific error messages

### Recommendations
1. Add Zod validation schemas for request bodies
2. Consider adding database indexes for performance
3. Add more controller functions (updateHabit, deleteHabit, etc.)
4. Consider pagination for large result sets
5. Add error codes for better client-side handling
6. Consider adding a `deletedAt` column for soft deletes instead of `isActive`

This schema and relation setup provides a solid foundation for a habit tracking application with proper data integrity and query flexibility.
