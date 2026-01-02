# Multi-Device Session Management in Node.js

A comprehensive guide on tracking user logins across multiple devices and managing concurrent sessions.

## Table of Contents
- [Overview](#overview)
- [Why Track Multiple Device Logins?](#why-track-multiple-device-logins)
- [Database Design](#database-design)
- [Implementation Approaches](#implementation-approaches)
  - [1. Session-Based Multi-Device Tracking](#1-session-based-multi-device-tracking)
  - [2. JWT with Refresh Token Tracking](#2-jwt-with-refresh-token-tracking)
  - [3. Hybrid Approach (JWT + Session Store)](#3-hybrid-approach-jwt--session-store)
- [Device Limit Enforcement](#device-limit-enforcement)
- [Logout Strategies](#logout-strategies)
- [Security Considerations](#security-considerations)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)

---

## Overview

Multi-device session management involves:
1. **Tracking** all active sessions/devices per user
2. **Limiting** the number of concurrent sessions
3. **Managing** which devices stay logged in
4. **Notifying** users of new logins
5. **Enforcing** security policies

---

## Why Track Multiple Device Logins?

### Use Cases

1. **Security**: Detect unauthorized access
2. **Licensing**: Enforce subscription limits (e.g., Netflix, Spotify)
3. **Compliance**: Track access for audit trails
4. **User Control**: Let users manage their active sessions
5. **Resource Management**: Limit concurrent connections
6. **Fraud Prevention**: Detect account sharing

### Common Scenarios

- **Streaming services**: "Watch on up to 3 devices"
- **Banking apps**: "Only 1 active session allowed"
- **SaaS products**: "5 team members per plan"
- **Educational platforms**: Prevent account sharing

---

## Database Design

### Option 1: Sessions Table (Recommended)

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session identification
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE,

  -- Device information
  device_id VARCHAR(255),
  device_name VARCHAR(100),
  device_type VARCHAR(50), -- 'mobile', 'tablet', 'desktop', 'tv'

  -- Browser/App information
  user_agent TEXT,
  browser VARCHAR(50),
  browser_version VARCHAR(20),
  os VARCHAR(50),
  os_version VARCHAR(20),

  -- Location information
  ip_address INET,
  country VARCHAR(2),
  city VARCHAR(100),

  -- Session metadata
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  -- Security
  is_trusted BOOLEAN DEFAULT false,
  login_method VARCHAR(50), -- 'password', 'oauth', 'biometric', 'magic_link'

  -- Indexes for performance
  INDEX idx_user_sessions_user_id (user_id),
  INDEX idx_user_sessions_token (session_token),
  INDEX idx_user_sessions_active (user_id, is_active, expires_at)
);
```

### Option 2: Drizzle ORM Schema

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  inet,
  index
} from 'drizzle-orm/pg-core'

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Session identification
  sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 255 }).unique(),

  // Device information
  deviceId: varchar('device_id', { length: 255 }),
  deviceName: varchar('device_name', { length: 100 }),
  deviceType: varchar('device_type', { length: 50 }),

  // Browser/App information
  userAgent: text('user_agent'),
  browser: varchar('browser', { length: 50 }),
  browserVersion: varchar('browser_version', { length: 20 }),
  os: varchar('os', { length: 50 }),
  osVersion: varchar('os_version', { length: 20 }),

  // Location information
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
  country: varchar('country', { length: 2 }),
  city: varchar('city', { length: 100 }),

  // Session metadata
  isActive: boolean('is_active').default(true).notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),

  // Security
  isTrusted: boolean('is_trusted').default(false),
  loginMethod: varchar('login_method', { length: 50 })
}, (table) => ({
  userIdIdx: index('idx_user_sessions_user_id').on(table.userId),
  sessionTokenIdx: index('idx_user_sessions_token').on(table.sessionToken),
  activeSessionsIdx: index('idx_user_sessions_active')
    .on(table.userId, table.isActive, table.expiresAt)
}))

export type UserSession = typeof userSessions.$inferSelect
export type NewUserSession = typeof userSessions.$inferInsert
```

---

## Implementation Approaches

### 1. Session-Based Multi-Device Tracking

Best for: Traditional web applications, when you need tight control over sessions

```javascript
import express from 'express'
import crypto from 'crypto'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'

const app = express()

// Session Manager Class
class SessionManager {
  constructor(db) {
    this.db = db
    this.MAX_DEVICES = 3 // Maximum allowed devices
  }

  // Parse device information from request
  parseDeviceInfo(req) {
    const parser = new UAParser(req.headers['user-agent'])
    const result = parser.getResult()
    const geo = geoip.lookup(req.ip)

    return {
      userAgent: req.headers['user-agent'],
      browser: result.browser.name,
      browserVersion: result.browser.version,
      os: result.os.name,
      osVersion: result.os.version,
      deviceType: result.device.type || 'desktop',
      deviceName: this.getDeviceName(result),
      ipAddress: req.ip,
      country: geo?.country || null,
      city: geo?.city || null
    }
  }

  getDeviceName(parserResult) {
    const { browser, os, device } = parserResult

    if (device.vendor && device.model) {
      return `${device.vendor} ${device.model}`
    }

    return `${browser.name} on ${os.name}`
  }

  // Create a new session
  async createSession(userId, req, loginMethod = 'password') {
    const deviceInfo = this.parseDeviceInfo(req)

    // Generate unique session token
    const sessionToken = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Check current active sessions
    const activeSessions = await this.getActiveSessions(userId)

    // If user has reached max devices, handle it
    if (activeSessions.length >= this.MAX_DEVICES) {
      await this.handleMaxDevicesReached(userId, activeSessions)
    }

    // Create new session
    const session = await this.db.userSessions.create({
      userId,
      sessionToken,
      ...deviceInfo,
      loginMethod,
      expiresAt,
      isActive: true,
      lastActivityAt: new Date()
    })

    return session
  }

  // Get active sessions for a user
  async getActiveSessions(userId) {
    return await this.db.userSessions.findAll({
      where: {
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      },
      order: [['lastActivityAt', 'DESC']]
    })
  }

  // Handle max devices reached
  async handleMaxDevicesReached(userId, activeSessions) {
    // Strategy 1: Logout oldest session (FIFO)
    // const oldestSession = activeSessions[activeSessions.length - 1]
    // await this.logoutSession(oldestSession.sessionToken)

    // Strategy 2: Logout least recently used (LRU)
    const lruSession = activeSessions.sort((a, b) =>
      new Date(a.lastActivityAt) - new Date(b.lastActivityAt)
    )[0]

    await this.logoutSession(lruSession.sessionToken)

    // Strategy 3: Logout all and force re-login
    // await this.logoutAllSessions(userId)
    // throw new Error('Maximum device limit reached. Please login again.')

    // Strategy 4: Ask user which device to logout
    // This would require a different flow with user interaction
  }

  // Validate session
  async validateSession(sessionToken) {
    const session = await this.db.userSessions.findOne({
      where: { sessionToken }
    })

    if (!session) {
      return { valid: false, reason: 'Session not found' }
    }

    if (!session.isActive) {
      return { valid: false, reason: 'Session deactivated' }
    }

    if (new Date() > session.expiresAt) {
      await this.logoutSession(sessionToken)
      return { valid: false, reason: 'Session expired' }
    }

    // Update last activity
    await this.updateLastActivity(sessionToken)

    return { valid: true, session }
  }

  // Update last activity timestamp
  async updateLastActivity(sessionToken) {
    await this.db.userSessions.update(
      { lastActivityAt: new Date() },
      { where: { sessionToken } }
    )
  }

  // Logout specific session
  async logoutSession(sessionToken) {
    await this.db.userSessions.update(
      { isActive: false },
      { where: { sessionToken } }
    )
  }

  // Logout all sessions for a user
  async logoutAllSessions(userId) {
    await this.db.userSessions.update(
      { isActive: false },
      { where: { userId, isActive: true } }
    )
  }

  // Logout all other sessions except current
  async logoutOtherSessions(userId, currentSessionToken) {
    await this.db.userSessions.update(
      { isActive: false },
      {
        where: {
          userId,
          isActive: true,
          sessionToken: { $ne: currentSessionToken }
        }
      }
    )
  }

  // Clean up expired sessions (run periodically)
  async cleanupExpiredSessions() {
    await this.db.userSessions.delete({
      where: {
        expiresAt: { $lt: new Date() }
      }
    })
  }
}

const sessionManager = new SessionManager(db)

// Login endpoint
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body

  // Validate credentials
  const user = await db.users.findOne({ where: { email } })

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  try {
    // Create session
    const session = await sessionManager.createSession(user.id, req)

    res.json({
      message: 'Login successful',
      sessionToken: session.sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  } catch (error) {
    if (error.message.includes('Maximum device limit')) {
      return res.status(403).json({
        error: 'Maximum device limit reached',
        message: 'You have reached the maximum number of devices. Please logout from another device.'
      })
    }
    throw error
  }
})

// Authentication middleware
async function authenticateSession(req, res, next) {
  const sessionToken = req.headers['authorization']?.split(' ')[1]

  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' })
  }

  const { valid, reason, session } = await sessionManager.validateSession(sessionToken)

  if (!valid) {
    return res.status(401).json({ error: `Invalid session: ${reason}` })
  }

  // Load user
  req.user = await db.users.findById(session.userId)
  req.session = session

  next()
}

// Get active sessions
app.get('/auth/sessions', authenticateSession, async (req, res) => {
  const sessions = await sessionManager.getActiveSessions(req.user.id)

  // Format sessions for display
  const formattedSessions = sessions.map(session => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    browser: session.browser,
    os: session.os,
    location: session.city ? `${session.city}, ${session.country}` : session.country,
    lastActivity: session.lastActivityAt,
    isCurrent: session.sessionToken === req.session.sessionToken,
    createdAt: session.createdAt
  }))

  res.json({ sessions: formattedSessions })
})

// Logout current session
app.post('/auth/logout', authenticateSession, async (req, res) => {
  await sessionManager.logoutSession(req.session.sessionToken)
  res.json({ message: 'Logged out successfully' })
})

// Logout specific session
app.delete('/auth/sessions/:sessionId', authenticateSession, async (req, res) => {
  const session = await db.userSessions.findById(req.params.sessionId)

  // Verify session belongs to current user
  if (session.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' })
  }

  await sessionManager.logoutSession(session.sessionToken)
  res.json({ message: 'Session terminated' })
})

// Logout all other sessions
app.post('/auth/logout-others', authenticateSession, async (req, res) => {
  await sessionManager.logoutOtherSessions(req.user.id, req.session.sessionToken)
  res.json({ message: 'All other sessions logged out' })
})

// Logout all sessions
app.post('/auth/logout-all', authenticateSession, async (req, res) => {
  await sessionManager.logoutAllSessions(req.user.id)
  res.json({ message: 'All sessions logged out' })
})

// Periodic cleanup job (run every hour)
setInterval(async () => {
  await sessionManager.cleanupExpiredSessions()
}, 60 * 60 * 1000)
```

---

### 2. JWT with Refresh Token Tracking

Best for: SPAs, mobile apps, microservices

```javascript
import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import UAParser from 'ua-parser-js'

const app = express()

class JWTSessionManager {
  constructor(db) {
    this.db = db
    this.MAX_DEVICES = 3
    this.ACCESS_TOKEN_EXPIRY = '15m'
    this.REFRESH_TOKEN_EXPIRY = '7d'
  }

  parseDeviceInfo(req) {
    const parser = new UAParser(req.headers['user-agent'])
    const result = parser.getResult()

    return {
      userAgent: req.headers['user-agent'],
      browser: result.browser.name,
      browserVersion: result.browser.version,
      os: result.os.name,
      osVersion: result.os.version,
      deviceType: result.device.type || 'desktop',
      deviceName: `${result.browser.name} on ${result.os.name}`,
      ipAddress: req.ip
    }
  }

  // Generate access token (short-lived)
  generateAccessToken(userId, sessionId) {
    return jwt.sign(
      { userId, sessionId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    )
  }

  // Generate refresh token (long-lived)
  generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex')
  }

  // Create session with tokens
  async createSession(userId, req) {
    const deviceInfo = this.parseDeviceInfo(req)

    // Check active sessions
    const activeSessions = await this.getActiveSessions(userId)

    if (activeSessions.length >= this.MAX_DEVICES) {
      // Remove oldest session
      const oldestSession = activeSessions[activeSessions.length - 1]
      await this.revokeSession(oldestSession.id)
    }

    // Generate tokens
    const refreshToken = this.generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // Create session record
    const session = await this.db.userSessions.create({
      userId,
      refreshToken,
      ...deviceInfo,
      expiresAt,
      isActive: true
    })

    // Generate access token
    const accessToken = this.generateAccessToken(userId, session.id)

    return {
      accessToken,
      refreshToken,
      session
    }
  }

  // Get active sessions
  async getActiveSessions(userId) {
    return await this.db.userSessions.findAll({
      where: {
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      },
      order: [['createdAt', 'DESC']]
    })
  }

  // Validate refresh token and issue new access token
  async refreshAccessToken(refreshToken) {
    const session = await this.db.userSessions.findOne({
      where: { refreshToken, isActive: true }
    })

    if (!session) {
      throw new Error('Invalid refresh token')
    }

    if (new Date() > session.expiresAt) {
      await this.revokeSession(session.id)
      throw new Error('Refresh token expired')
    }

    // Update last activity
    await this.db.userSessions.update(
      { lastActivityAt: new Date() },
      { where: { id: session.id } }
    )

    // Generate new access token
    const accessToken = this.generateAccessToken(session.userId, session.id)

    return { accessToken, session }
  }

  // Revoke session
  async revokeSession(sessionId) {
    await this.db.userSessions.update(
      { isActive: false },
      { where: { id: sessionId } }
    )
  }

  // Revoke all sessions
  async revokeAllSessions(userId) {
    await this.db.userSessions.update(
      { isActive: false },
      { where: { userId, isActive: true } }
    )
  }
}

const jwtSessionManager = new JWTSessionManager(db)

// Login endpoint
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body

  const user = await db.users.findOne({ where: { email } })

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const { accessToken, refreshToken, session } =
    await jwtSessionManager.createSession(user.id, req)

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  })
})

// JWT authentication middleware
async function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' })
    }

    // Verify session is still active
    const session = await db.userSessions.findById(decoded.sessionId)

    if (!session || !session.isActive) {
      return res.status(401).json({ error: 'Session invalid' })
    }

    req.user = await db.users.findById(decoded.userId)
    req.sessionId = decoded.sessionId

    next()
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

// Refresh token endpoint
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' })
  }

  try {
    const { accessToken } = await jwtSessionManager.refreshAccessToken(refreshToken)

    res.json({ accessToken })
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})

// Get active sessions
app.get('/auth/sessions', authenticateJWT, async (req, res) => {
  const sessions = await jwtSessionManager.getActiveSessions(req.user.id)

  const formattedSessions = sessions.map(session => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    browser: session.browser,
    os: session.os,
    lastActivity: session.lastActivityAt,
    isCurrent: session.id === req.sessionId,
    createdAt: session.createdAt
  }))

  res.json({ sessions: formattedSessions })
})

// Logout (revoke refresh token)
app.post('/auth/logout', authenticateJWT, async (req, res) => {
  await jwtSessionManager.revokeSession(req.sessionId)
  res.json({ message: 'Logged out successfully' })
})

// Logout specific session
app.delete('/auth/sessions/:sessionId', authenticateJWT, async (req, res) => {
  const session = await db.userSessions.findById(req.params.sessionId)

  if (session.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' })
  }

  await jwtSessionManager.revokeSession(req.params.sessionId)
  res.json({ message: 'Session revoked' })
})

// Logout all sessions
app.post('/auth/logout-all', authenticateJWT, async (req, res) => {
  await jwtSessionManager.revokeAllSessions(req.user.id)
  res.json({ message: 'All sessions revoked' })
})
```

---

### 3. Hybrid Approach (JWT + Session Store)

Best for: Maximum flexibility with Redis for fast lookups

```javascript
import express from 'express'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import crypto from 'crypto'

const app = express()
const redis = new Redis()

class HybridSessionManager {
  constructor(db, redis) {
    this.db = db
    this.redis = redis
    this.MAX_DEVICES = 3
  }

  async createSession(userId, req) {
    const deviceInfo = this.parseDeviceInfo(req)

    // Generate session ID
    const sessionId = crypto.randomBytes(16).toString('hex')

    // Check device count in Redis (fast)
    const sessionKey = `user:${userId}:sessions`
    const sessionCount = await this.redis.scard(sessionKey)

    if (sessionCount >= this.MAX_DEVICES) {
      // Get oldest session
      const sessions = await this.redis.smembers(sessionKey)
      const oldestSessionId = sessions[0] // Assuming FIFO

      // Remove from Redis
      await this.redis.srem(sessionKey, oldestSessionId)
      await this.redis.del(`session:${oldestSessionId}`)

      // Mark as inactive in DB
      await this.db.userSessions.update(
        { isActive: false },
        { where: { id: oldestSessionId } }
      )
    }

    // Store in database
    const session = await this.db.userSessions.create({
      id: sessionId,
      userId,
      ...deviceInfo,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true
    })

    // Store in Redis for fast access
    await this.redis.sadd(sessionKey, sessionId)
    await this.redis.setex(
      `session:${sessionId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify({ userId, deviceInfo })
    )

    // Generate JWT
    const token = jwt.sign(
      { userId, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )

    return { token, session }
  }

  async validateSession(sessionId) {
    // Check Redis first (fast)
    const sessionData = await this.redis.get(`session:${sessionId}`)

    if (!sessionData) {
      return { valid: false }
    }

    return { valid: true, session: JSON.parse(sessionData) }
  }

  async revokeSession(userId, sessionId) {
    // Remove from Redis
    await this.redis.srem(`user:${userId}:sessions`, sessionId)
    await this.redis.del(`session:${sessionId}`)

    // Mark inactive in DB
    await this.db.userSessions.update(
      { isActive: false },
      { where: { id: sessionId } }
    )
  }
}
```

---

## Device Limit Enforcement

### Different Strategies

```javascript
class DeviceLimitStrategy {
  // Strategy 1: FIFO (First In, First Out)
  static async fifo(activeSessions) {
    // Remove oldest session by creation time
    const oldestSession = activeSessions.sort((a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt)
    )[0]

    return oldestSession
  }

  // Strategy 2: LRU (Least Recently Used)
  static async lru(activeSessions) {
    // Remove session with oldest last activity
    const lruSession = activeSessions.sort((a, b) =>
      new Date(a.lastActivityAt) - new Date(b.lastActivityAt)
    )[0]

    return lruSession
  }

  // Strategy 3: Prompt user to choose
  static async userChoice(activeSessions, res) {
    return res.status(409).json({
      error: 'Maximum devices reached',
      message: 'Please select a device to logout',
      sessions: activeSessions.map(s => ({
        id: s.id,
        deviceName: s.deviceName,
        lastActivity: s.lastActivityAt
      }))
    })
  }

  // Strategy 4: Logout all and force new login
  static async logoutAll(userId, sessionManager) {
    await sessionManager.logoutAllSessions(userId)
    throw new Error('Maximum devices reached. All sessions logged out.')
  }

  // Strategy 5: Device type priority
  static async devicePriority(activeSessions) {
    // Priority: mobile > tablet > desktop > tv
    const priority = { mobile: 1, tablet: 2, desktop: 3, tv: 4 }

    const lowestPriority = activeSessions.sort((a, b) =>
      (priority[b.deviceType] || 5) - (priority[a.deviceType] || 5)
    )[0]

    return lowestPriority
  }

  // Strategy 6: Trusted devices
  static async untrustedFirst(activeSessions) {
    // Remove untrusted devices first
    const untrusted = activeSessions.filter(s => !s.isTrusted)

    if (untrusted.length > 0) {
      return untrusted[0]
    }

    // If all trusted, use LRU
    return this.lru(activeSessions)
  }
}

// Example usage
async handleMaxDevices(userId, activeSessions, strategy = 'lru') {
  let sessionToRemove

  switch(strategy) {
    case 'fifo':
      sessionToRemove = await DeviceLimitStrategy.fifo(activeSessions)
      break
    case 'lru':
      sessionToRemove = await DeviceLimitStrategy.lru(activeSessions)
      break
    case 'device-priority':
      sessionToRemove = await DeviceLimitStrategy.devicePriority(activeSessions)
      break
    case 'untrusted-first':
      sessionToRemove = await DeviceLimitStrategy.untrustedFirst(activeSessions)
      break
    default:
      sessionToRemove = await DeviceLimitStrategy.lru(activeSessions)
  }

  await this.revokeSession(sessionToRemove.id)
}
```

---

## Logout Strategies

### 1. Single Device Logout

```javascript
app.post('/auth/logout', authenticateSession, async (req, res) => {
  await sessionManager.logoutSession(req.session.sessionToken)

  res.json({
    message: 'Logged out from this device',
    deviceName: req.session.deviceName
  })
})
```

### 2. Logout from Specific Device

```javascript
app.delete('/auth/sessions/:sessionId', authenticateSession, async (req, res) => {
  const session = await db.userSessions.findById(req.params.sessionId)

  if (session.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  await sessionManager.logoutSession(session.sessionToken)

  // Send push notification to that device
  await sendPushNotification(session.deviceId, {
    title: 'Session Terminated',
    body: 'You have been logged out from this device'
  })

  res.json({ message: 'Device logged out successfully' })
})
```

### 3. Logout All Other Devices

```javascript
app.post('/auth/logout-others', authenticateSession, async (req, res) => {
  const otherSessions = await db.userSessions.findAll({
    where: {
      userId: req.user.id,
      sessionToken: { $ne: req.session.sessionToken },
      isActive: true
    }
  })

  // Logout each session
  for (const session of otherSessions) {
    await sessionManager.logoutSession(session.sessionToken)

    // Notify each device
    await sendPushNotification(session.deviceId, {
      title: 'Logged Out',
      body: 'You were logged out from another device'
    })
  }

  res.json({
    message: `Logged out from ${otherSessions.length} other device(s)`
  })
})
```

### 4. Logout All Devices

```javascript
app.post('/auth/logout-all', authenticateSession, async (req, res) => {
  await sessionManager.logoutAllSessions(req.user.id)

  res.json({ message: 'Logged out from all devices' })
})
```

---

## Security Considerations

### 1. Detect Suspicious Activity

```javascript
class SecurityMonitor {
  async detectSuspiciousLogin(userId, req) {
    const recentSessions = await db.userSessions.findAll({
      where: {
        userId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })

    const alerts = []

    // Check for location changes
    const currentGeo = geoip.lookup(req.ip)
    const previousLocations = recentSessions.map(s => s.country).filter(Boolean)

    if (currentGeo && !previousLocations.includes(currentGeo.country)) {
      alerts.push({
        type: 'NEW_LOCATION',
        message: `Login from new location: ${currentGeo.country}`
      })
    }

    // Check for new device
    const currentDevice = this.parseDeviceInfo(req)
    const knownDevices = recentSessions.map(s => s.deviceName)

    if (!knownDevices.includes(currentDevice.deviceName)) {
      alerts.push({
        type: 'NEW_DEVICE',
        message: `Login from new device: ${currentDevice.deviceName}`
      })
    }

    // Check for rapid logins from different IPs
    const recentIPs = recentSessions
      .filter(s => Date.now() - new Date(s.createdAt) < 60 * 60 * 1000)
      .map(s => s.ipAddress)

    if (recentIPs.length > 3 && !recentIPs.includes(req.ip)) {
      alerts.push({
        type: 'MULTIPLE_IPS',
        message: 'Multiple IPs detected in short time'
      })
    }

    // Send alerts if any
    if (alerts.length > 0) {
      await this.sendSecurityAlert(userId, alerts)
    }

    return alerts
  }

  async sendSecurityAlert(userId, alerts) {
    const user = await db.users.findById(userId)

    // Send email
    await sendEmail({
      to: user.email,
      subject: 'Security Alert: New Login Detected',
      template: 'security-alert',
      data: { alerts, user }
    })

    // Send push notification
    await sendPushNotification(userId, {
      title: 'Security Alert',
      body: 'New login detected from an unrecognized device or location'
    })
  }
}
```

### 2. Rate Limiting

```javascript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Store in Redis for distributed systems
  store: new RedisStore({
    client: redis,
    prefix: 'rate-limit:login:'
  })
})

app.post('/auth/login', loginLimiter, async (req, res) => {
  // Login logic
})
```

### 3. Session Fingerprinting

```javascript
function generateFingerprint(req) {
  const components = [
    req.headers['user-agent'],
    req.headers['accept-language'],
    req.headers['accept-encoding'],
    req.ip
  ]

  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
}

// Store fingerprint with session
async function createSession(userId, req) {
  const fingerprint = generateFingerprint(req)

  // ... create session with fingerprint
}

// Verify fingerprint on each request
async function validateFingerprint(req, session) {
  const currentFingerprint = generateFingerprint(req)

  if (currentFingerprint !== session.fingerprint) {
    // Potential session hijacking
    await sessionManager.logoutSession(session.sessionToken)
    throw new Error('Session fingerprint mismatch')
  }
}
```

---

## Real-World Examples

### Example 1: Netflix-style Device Management

```javascript
// User can see all devices and remove them
app.get('/account/devices', authenticateSession, async (req, res) => {
  const sessions = await sessionManager.getActiveSessions(req.user.id)

  const devices = sessions.map(session => ({
    id: session.id,
    name: session.deviceName,
    type: session.deviceType,
    location: `${session.city}, ${session.country}`,
    lastUsed: session.lastActivityAt,
    isCurrentDevice: session.id === req.session.id
  }))

  res.render('account/devices', { devices })
})

app.post('/account/devices/:id/remove', authenticateSession, async (req, res) => {
  const session = await db.userSessions.findById(req.params.id)

  if (session.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  await sessionManager.logoutSession(session.sessionToken)

  res.json({ message: 'Device removed successfully' })
})
```

### Example 2: Banking App (1 Device Only)

```javascript
class BankingSessionManager extends SessionManager {
  constructor(db) {
    super(db)
    this.MAX_DEVICES = 1
  }

  async handleMaxDevicesReached(userId, activeSessions) {
    // Force logout all existing sessions
    await this.logoutAllSessions(userId)

    // Send security alert
    const user = await this.db.users.findById(userId)
    await sendEmail({
      to: user.email,
      subject: 'New Login to Your Account',
      body: 'A new login was detected. Previous session was terminated.'
    })
  }
}
```

### Example 3: SaaS with Team Plans

```javascript
class TeamSessionManager extends SessionManager {
  async createSession(userId, req) {
    // Check user's team plan
    const user = await db.users.findById(userId)
    const team = await db.teams.findById(user.teamId)

    // Set limit based on plan
    this.MAX_DEVICES = team.plan.maxDevicesPerUser || 3

    return super.createSession(userId, req)
  }
}
```

---

## Best Practices

### 1. Always Track Essential Information
- Device type and name
- IP address and location
- Last activity timestamp
- User agent and browser

### 2. Implement Proper Cleanup
```javascript
// Clean up expired sessions daily
cron.schedule('0 0 * * *', async () => {
  await sessionManager.cleanupExpiredSessions()
})
```

### 3. Notify Users of New Logins
```javascript
async function notifyNewLogin(userId, deviceInfo) {
  const user = await db.users.findById(userId)

  await sendEmail({
    to: user.email,
    subject: 'New login to your account',
    template: 'new-login',
    data: {
      deviceName: deviceInfo.deviceName,
      location: deviceInfo.city,
      time: new Date()
    }
  })
}
```

### 4. Provide Device Management UI
- Show all active sessions
- Allow users to revoke specific sessions
- Display last activity time
- Show device details

### 5. Consider User Experience
- Don't be too aggressive with limits
- Provide clear error messages
- Allow users to choose which device to logout
- Send notifications before forcing logout

### 6. Security First
- Always use HTTPS
- Implement rate limiting
- Monitor for suspicious activity
- Use session fingerprinting
- Log all authentication events

### 7. Performance Optimization
- Use Redis for session storage
- Index database queries properly
- Cache frequently accessed data
- Batch cleanup operations

---

## Summary

| Approach | Best For | Pros | Cons |
|----------|----------|------|------|
| Session-based | Traditional web apps | Easy to implement, tight control | Requires session store |
| JWT + Refresh tokens | SPAs, mobile apps | Stateless, scalable | Harder to revoke |
| Hybrid (Redis + DB) | High-traffic apps | Fast, scalable | More complex |

**Key Takeaways:**
- Always track device information for security
- Choose device limit based on your use case
- Implement proper cleanup mechanisms
- Notify users of suspicious activity
- Provide users with session management tools
- Balance security with user experience
