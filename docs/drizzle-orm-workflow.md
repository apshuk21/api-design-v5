# Drizzle ORM Workflow: Complete Guide

## Table of Contents
1. [What is Drizzle ORM?](#what-is-drizzle-orm)
2. [Your Project Setup](#your-project-setup)
3. [Understanding Drizzle Commands](#understanding-drizzle-commands)
4. [Migration vs Push: The Critical Difference](#migration-vs-push-the-critical-difference)
5. [Development Workflow](#development-workflow)
6. [Production Workflow](#production-workflow)
7. [Complete Examples](#complete-examples)
8. [Best Practices](#best-practices)

---

## What is Drizzle ORM?

Drizzle is a TypeScript-first ORM (Object-Relational Mapping) that provides:
- **Type-safe** database queries
- **Schema definition** in TypeScript (not SQL)
- **Schema migration** management
- **Zero dependencies** runtime

Unlike traditional ORMs, Drizzle gives you full control over your SQL while maintaining type safety.

---

## Your Project Setup

### Configuration Files

**1. drizzle.config.ts** - Drizzle Kit configuration:
```typescript
export default defineConfig({
  schema: './src/db/schema.ts',      // Where your tables are defined
  out: './migrations',                // Where migration files are generated
  dialect: 'postgresql',              // Database type
  dbCredentials: {
    url: env.DATABASE_URL,            // Connection string
  },
  verbose: true,                      // Show detailed logs
  strict: true,                       // Enable strict mode
})
```

**2. src/db/schema.ts** - Your database schema:
```typescript
// This is your source of truth for database structure
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  // ... more fields
})

export const habits = pgTable('habits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // ... more fields
})
```

### Package.json Scripts

From your [package.json](../package.json):
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "node src/db/seed.ts"
  }
}
```

---

## Understanding Drizzle Commands

### 1. `db:generate` (drizzle-kit generate)

**What it does:**
- Reads your `schema.ts` file
- Compares it with the previous state (from meta folder)
- Generates SQL migration files in the `migrations/` folder
- Does **NOT** touch your database

**Output:**
```
migrations/
  ├── 0000_initial_schema.sql
  ├── 0001_add_habits_table.sql
  ├── 0002_add_tags_table.sql
  └── meta/
      ├── _journal.json
      └── 0000_snapshot.json
```

**When to use:**
- When you change your schema and want to create migration files
- Before committing schema changes to version control
- In **development** and **production** workflows

**Example:**
```bash
# You modify schema.ts to add a new field
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phoneNumber: varchar('phone_number', { length: 20 }), // NEW FIELD
})

# Run generate
npm run db:generate

# Output: Creates migrations/0003_add_phone_number.sql
# Content:
ALTER TABLE "users" ADD COLUMN "phone_number" VARCHAR(20);
```

---

### 2. `db:push` (drizzle-kit push)

**What it does:**
- Reads your `schema.ts` file
- Compares it with your **actual database**
- **Immediately** applies changes directly to the database
- Does **NOT** create migration files
- Does **NOT** track migration history

**When to use:**
- ✅ **Local development** / **prototyping**
- ✅ When experimenting with schema changes
- ✅ Quick iterations during feature development
- ❌ **NEVER in production**

**Example:**
```bash
# You're developing locally and want to quickly test a schema change
npm run db:push

# Drizzle shows you what will change:
#
# Changes to be applied:
# - CREATE TABLE "users" (...)
# - ALTER TABLE "habits" ADD COLUMN "streak_count" INTEGER
#
# Apply changes? (y/N): y
#
# ✓ Changes applied successfully
```

**Why NOT in production:**
- No migration history
- Can't rollback changes
- Can cause data loss (dropping columns happens immediately)
- No audit trail of database changes
- Team members won't have a record of what changed

---

### 3. `db:migrate` (drizzle-kit migrate)

**What it does:**
- Reads migration files from `migrations/` folder
- Executes them **in order** against the database
- Tracks which migrations have been run (in `__drizzle_migrations` table)
- Skips already-applied migrations

**When to use:**
- ✅ **Production deployments**
- ✅ Setting up a new development environment
- ✅ CI/CD pipelines
- ✅ When working in a team

**Example:**
```bash
# After generating migrations, apply them to database
npm run db:migrate

# Output:
# Applying migrations...
# [0000_initial_schema.sql] ✓ Applied
# [0001_add_habits_table.sql] ✓ Applied
# [0002_add_tags_table.sql] ✓ Applied
#
# Database tracking table:
# __drizzle_migrations
# ┌────┬─────────────────────────┬──────────────────────┐
# │ id │ migration               │ created_at           │
# ├────┼─────────────────────────┼──────────────────────┤
# │ 1  │ 0000_initial_schema     │ 2025-01-02 10:00:00  │
# │ 2  │ 0001_add_habits_table   │ 2025-01-02 10:00:01  │
# │ 3  │ 0002_add_tags_table     │ 2025-01-02 10:00:02  │
# └────┴─────────────────────────┴──────────────────────┘
```

---

### 4. `db:studio` (drizzle-kit studio)

**What it does:**
- Launches a web-based database browser
- Runs on `https://local.drizzle.studio`
- Lets you view and edit data visually

**When to use:**
- Inspecting database contents
- Quick data edits during development
- Debugging data issues

---

### 5. `db:seed` (node src/db/seed.ts)

**What it does:**
- Custom script (not a Drizzle command)
- Populates database with sample data
- Useful for development and testing

---

## Migration vs Push: The Critical Difference

### Visual Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                    PUSH WORKFLOW (Development)                  │
└─────────────────────────────────────────────────────────────────┘

schema.ts                                  Database
┌─────────────┐                         ┌──────────────┐
│ Change      │   db:push (instant)     │ Tables       │
│ schema      │ ───────────────────────>│ updated      │
└─────────────┘                         └──────────────┘
                                              ↓
                                        ⚠️  No history
                                        ⚠️  No rollback
                                        ⚠️  Not tracked in Git


┌─────────────────────────────────────────────────────────────────┐
│                 MIGRATION WORKFLOW (Production)                 │
└─────────────────────────────────────────────────────────────────┘

schema.ts          migrations/              Database
┌─────────────┐   ┌──────────────┐      ┌──────────────┐
│ Change      │   │ SQL files    │      │ Tables       │
│ schema      │   │ with         │      │ updated      │
└──────┬──────┘   │ history      │      └──────────────┘
       │          └──────────────┘             ↑
       │                 ↑                     │
       │                 │                     │
       └──db:generate───>│                     │
                         │                     │
                         └────db:migrate───────┘

                         ✓ Version controlled
                         ✓ Rollback possible
                         ✓ Team collaboration
                         ✓ Audit trail
```

### Detailed Comparison Table

| Feature | `db:push` | `db:migrate` |
|---------|-----------|--------------|
| **Creates migration files** | ❌ No | ✅ Yes (via `db:generate`) |
| **Tracks history** | ❌ No | ✅ Yes |
| **Can rollback** | ❌ No | ✅ Yes (manually) |
| **Version controlled** | ❌ No | ✅ Yes (SQL files in Git) |
| **Speed** | ⚡ Instant | 🐢 Requires generate + migrate |
| **Safety** | ⚠️  Low | ✅ High |
| **Use in development** | ✅ Perfect | ✅ Good |
| **Use in production** | ❌ NEVER | ✅ ALWAYS |
| **Team collaboration** | ❌ Poor | ✅ Excellent |
| **Data safety** | ⚠️  Can lose data | ✅ Controlled |

---

## Development Workflow

### Scenario 1: Solo Developer, Rapid Prototyping

**Using `db:push` (Recommended for speed):**

```bash
# 1. Start with schema
# Edit src/db/schema.ts - add a new table or field

# 2. Push directly to local database
npm run db:push

# 3. Test your changes
npm run dev

# 4. Make more changes to schema
# Edit src/db/schema.ts again

# 5. Push again (iterates quickly)
npm run db:push

# 6. When feature is stable, generate proper migrations
npm run db:generate

# 7. Commit both schema.ts and migration files
git add src/db/schema.ts migrations/
git commit -m "Add user profile feature"
```

**Pros:**
- ⚡ Fast iteration
- No migration file clutter during experimentation

**Cons:**
- ⚠️  Can lose data if you drop columns
- No history during development

---

### Scenario 2: Team Development (Recommended)

**Using `db:generate` + `db:migrate`:**

```bash
# Developer A: Makes schema change
# Edit src/db/schema.ts

# Generate migration
npm run db:generate
# Creates: migrations/0005_add_user_profile.sql

# Apply migration locally
npm run db:migrate

# Commit changes
git add src/db/schema.ts migrations/
git commit -m "Add user profile fields"
git push

# ─────────────────────────────────────────────────

# Developer B: Pulls changes
git pull

# Apply migrations (only new ones run)
npm run db:migrate
# Output: [0005_add_user_profile.sql] ✓ Applied

# Developer B's database now matches Developer A's
```

**Pros:**
- ✅ Team stays in sync
- ✅ Full audit trail
- ✅ Can review changes in PR

**Cons:**
- 🐢 Slower iteration (need generate + migrate)

---

## Production Workflow

### ⚠️  CRITICAL RULES FOR PRODUCTION

1. **NEVER use `db:push`** in production
2. **ALWAYS use `db:migrate`** in production
3. **ALWAYS test migrations** in staging first
4. **ALWAYS backup** before running migrations
5. **ALWAYS use transactions** for migrations (Drizzle does this automatically)

---

### Production Deployment Process

```bash
┌─────────────────────────────────────────────────────────────┐
│                 PRODUCTION DEPLOYMENT                       │
└─────────────────────────────────────────────────────────────┘

Step 1: Development
┌────────────────────────────────────┐
│ Local Machine                      │
│ 1. Edit schema.ts                  │
│ 2. npm run db:generate             │
│ 3. npm run db:migrate (test local) │
│ 4. git commit & push               │
└────────────────────────────────────┘
                 ↓
Step 2: Code Review
┌────────────────────────────────────┐
│ GitHub / GitLab                    │
│ 1. Review schema changes           │
│ 2. Review generated SQL            │
│ 3. Check for dangerous operations  │
│    - DROP COLUMN                   │
│    - ALTER TYPE                    │
│ 4. Approve PR                      │
└────────────────────────────────────┘
                 ↓
Step 3: Staging
┌────────────────────────────────────┐
│ Staging Server                     │
│ 1. Deploy code                     │
│ 2. npm run db:migrate              │
│ 3. Run tests                       │
│ 4. Verify application works        │
└────────────────────────────────────┘
                 ↓
Step 4: Production
┌────────────────────────────────────┐
│ Production Server                  │
│ 1. Backup database                 │
│ 2. Deploy code                     │
│ 3. npm run db:migrate              │
│ 4. Monitor for errors              │
│ 5. Rollback if needed              │
└────────────────────────────────────┘
```

---

## Complete Examples

### Example 1: Adding a New Field (Development)

**Method A: Using Push (Quick iteration)**

```bash
# 1. Edit schema
# src/db/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  bio: text('bio'), // ← NEW FIELD
})

# 2. Push to database
npm run db:push

# Output:
# Changes detected:
# • ALTER TABLE "users" ADD COLUMN "bio" TEXT
#
# Apply? (y/N): y
# ✓ Changes applied

# 3. Test feature
npm run dev

# 4. Feature works! Generate proper migration
npm run db:generate

# Output:
# ✓ Generated migrations/0006_add_user_bio.sql

# 5. Commit
git add src/db/schema.ts migrations/
git commit -m "feat: add user bio field"
```

---

**Method B: Using Generate + Migrate (Team workflow)**

```bash
# 1. Edit schema
# src/db/schema.ts (same as above)

# 2. Generate migration
npm run db:generate

# Output:
# ✓ Generated migrations/0006_add_user_bio.sql
# Content: ALTER TABLE "users" ADD COLUMN "bio" TEXT;

# 3. Review the generated SQL
cat migrations/0006_add_user_bio.sql

# 4. Apply migration
npm run db:migrate

# Output:
# [0006_add_user_bio.sql] ✓ Applied

# 5. Commit
git add src/db/schema.ts migrations/
git commit -m "feat: add user bio field"
```

---

### Example 2: Dangerous Operation (Renaming Column)

**⚠️  This can cause data loss if not careful!**

```bash
# WRONG WAY (will lose data):
# src/db/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 100 }), // Renamed from 'username'
})

npm run db:push
# Drizzle will:
# 1. DROP COLUMN "username"     ← ⚠️  DATA LOST!
# 2. ADD COLUMN "full_name"     ← New empty column

# ────────────────────────────────────────────────────────────

# CORRECT WAY (preserve data):

# Step 1: Add new column
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }), // Keep old
  fullName: varchar('full_name', { length: 100 }), // Add new
})

npm run db:generate
npm run db:migrate

# Step 2: Write custom migration to copy data
# migrations/0007_copy_username_to_fullname.sql
UPDATE users SET full_name = username WHERE full_name IS NULL;

# Run migration
npm run db:migrate

# Step 3: Remove old column
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 100 }),
})

npm run db:generate
npm run db:migrate
```

---

### Example 3: Setting Up New Developer's Environment

```bash
# New developer clones repo
git clone <repo-url>
cd api-design-v5

# Install dependencies
npm install

# Create .env file with DATABASE_URL
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/habitdb" > .env

# Create database (if needed)
createdb habitdb

# Run all migrations
npm run db:migrate

# Output:
# Applying migrations...
# [0000_initial_schema.sql] ✓ Applied
# [0001_add_habits_table.sql] ✓ Applied
# [0002_add_tags_table.sql] ✓ Applied
# [0003_add_entries_table.sql] ✓ Applied
# ... all migrations applied

# Seed database with sample data
npm run db:seed

# Start development
npm run dev
```

---

### Example 4: Production Deployment with CI/CD

**GitHub Actions workflow:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Deploy application
        run: npm run deploy
```

**Manual production deployment:**

```bash
# On production server

# 1. Backup database
pg_dump habitdb > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm ci

# 4. Run migrations (in transaction)
npm run db:migrate

# Output:
# Applying migrations...
# [0008_add_user_avatar.sql] ✓ Applied
#
# All migrations successful!

# 5. Restart application
pm2 restart api-design-v5

# 6. Monitor logs
pm2 logs api-design-v5

# 7. If something breaks, rollback
# Restore database backup
psql habitdb < backup-20250102-100000.sql

# Revert code
git reset --hard HEAD~1
pm2 restart api-design-v5
```

---

## Best Practices

### ✅ DO

1. **Use `db:generate` + `db:migrate` in production**
   - Always generate migration files
   - Track them in version control
   - Review SQL before applying

2. **Use `db:push` for rapid prototyping**
   - Quick local iterations
   - Experimenting with schema
   - Switch to migrations before committing

3. **Review generated migrations**
   ```bash
   npm run db:generate
   cat migrations/0009_latest.sql  # Always review!
   ```

4. **Test migrations in staging**
   - Never run untested migrations in production
   - Use production data copy in staging

5. **Keep schema.ts as source of truth**
   - Never manually edit migration files
   - Always change schema.ts, then generate

6. **Commit migrations with schema changes**
   ```bash
   git add src/db/schema.ts migrations/
   git commit -m "Add user profile feature"
   ```

---

### ❌ DON'T

1. **Never use `db:push` in production**
   - No history = no rollback
   - No audit trail
   - Team confusion

2. **Never manually edit the database schema**
   - Always use Drizzle to manage schema
   - Manual changes will be overwritten

3. **Never skip migration generation**
   ```bash
   # BAD: Make schema change and push to prod without migration
   # GOOD: schema change → generate → test → migrate in prod
   ```

4. **Never delete migration files**
   - They're the history of your database
   - Other developers/servers need them

5. **Don't mix push and migrate workflows**
   - Choose one approach per environment
   - Development: push is fine
   - Production: always migrate

---

## Summary Decision Tree

```
Do you want to change your database schema?
│
├─ Are you in PRODUCTION?
│  │
│  ├─ YES → Use migrations
│  │        1. Edit schema.ts
│  │        2. npm run db:generate
│  │        3. Test in staging
│  │        4. npm run db:migrate in production
│  │
│  └─ NO → Are you experimenting/prototyping?
│     │
│     ├─ YES → Use push
│     │        1. Edit schema.ts
│     │        2. npm run db:push
│     │        3. When done, npm run db:generate
│     │        4. Commit schema + migrations
│     │
│     └─ NO → Use migrations (team workflow)
│              1. Edit schema.ts
│              2. npm run db:generate
│              3. npm run db:migrate
│              4. Commit and push
```

---

## Key Takeaways

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `db:generate` | Create migration SQL files | Always before committing schema changes |
| `db:push` | Instant schema sync (no migrations) | Local dev, prototyping only |
| `db:migrate` | Run migrations in order | Production, staging, team dev |
| `db:studio` | Visual database browser | Debugging, data inspection |

**Golden Rule:**
- Development: `push` for speed, `generate + migrate` for teamwork
- Production: **ONLY** `generate + migrate`, **NEVER** `push`
