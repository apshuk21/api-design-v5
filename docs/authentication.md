# Authentication in Node.js

Authentication is the process of verifying the identity of a user or system. It answers the question: "Who are you?"

## Table of Contents
- [Authentication Methods](#authentication-methods)
  - [1. Session-Based Authentication](#1-session-based-authentication)
  - [2. JWT (JSON Web Token) Based Authentication](#2-jwt-json-web-token-based-authentication)
  - [3. API Key Authentication](#3-api-key-authentication)
  - [4. OAuth 2.0 / OpenID Connect](#4-oauth-20--openid-connect)
  - [5. Basic Authentication](#5-basic-authentication)
  - [6. Token-Based Authentication (Non-JWT)](#6-token-based-authentication-non-jwt)
  - [7. Certificate-Based Authentication (mTLS)](#7-certificate-based-authentication-mtls)
  - [8. Biometric Authentication](#8-biometric-authentication)
  - [9. Magic Link / Passwordless Authentication](#9-magic-link--passwordless-authentication)
  - [10. Multi-Factor Authentication (MFA)](#10-multi-factor-authentication-mfa)
- [Comparison Table](#comparison-table)
- [Best Practices](#best-practices)

---

## Authentication Methods

### 1. Session-Based Authentication

**How it works:**
1. User submits credentials (username/password)
2. Server validates credentials
3. Server creates a session and stores it (in memory, Redis, database)
4. Server sends a session ID to the client via a cookie
5. Client sends the cookie with each subsequent request
6. Server validates the session ID and retrieves user data

**Example Implementation:**

```javascript
import express from 'express'
import session from 'express-session'
import RedisStore from 'connect-redis'
import { createClient } from 'redis'

const app = express()

// Initialize Redis client
const redisClient = createClient({
  host: 'localhost',
  port: 6379
})

// Configure session middleware
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true, // Prevents XSS
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}))

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body

  // Validate credentials
  const user = await validateUser(email, password)

  if (user) {
    // Store user data in session
    req.session.userId = user.id
    req.session.email = user.email
    res.json({ message: 'Login successful' })
  } else {
    res.status(401).json({ error: 'Invalid credentials' })
  }
})

// Protected route
app.get('/profile', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  res.json({ userId: req.session.userId, email: req.session.email })
})

// Logout route
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' })
    }
    res.clearCookie('connect.sid')
    res.json({ message: 'Logged out successfully' })
  })
})
```

**When to Use:**
- Traditional web applications with server-side rendering
- When you need server-side session management
- When you want easy session invalidation
- Monolithic applications

**Pros:**
- ✅ Easy to invalidate sessions server-side
- ✅ No token stored on client (just session ID)
- ✅ Session data stored securely on server
- ✅ Works well with SSR (Server-Side Rendering)
- ✅ Easy to implement session expiration and renewal

**Cons:**
- ❌ Requires server-side storage (memory, Redis, database)
- ❌ Not ideal for distributed systems without shared session store
- ❌ CORS complications for cross-domain requests
- ❌ Scalability issues (need sticky sessions or shared session store)
- ❌ Not suitable for mobile apps or SPAs without additional setup

---

### 2. JWT (JSON Web Token) Based Authentication

**How it works:**
1. User submits credentials
2. Server validates credentials
3. Server creates a JWT containing user claims
4. Server signs the JWT with a secret key
5. Server sends JWT to client
6. Client stores JWT (localStorage, sessionStorage, or memory)
7. Client sends JWT in Authorization header with each request
8. Server verifies JWT signature and extracts user data

**Example Implementation:**

```javascript
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

const app = express()

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = '7d'

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body

  // Find user
  const user = await db.users.findByEmail(email)

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password)

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Create JWT payload
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  }

  // Sign token
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

  res.json({ token, user: { id: user.id, email: user.email } })
})

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

// Protected route
app.get('/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user })
})

// Refresh token implementation
app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)

    // Create new access token
    const accessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      JWT_SECRET,
      { expiresIn: '15m' }
    )

    res.json({ accessToken })
  } catch (err) {
    res.status(403).json({ error: 'Invalid refresh token' })
  }
})
```

**When to Use:**
- Single Page Applications (SPAs)
- Mobile applications
- Microservices architecture
- APIs consumed by multiple clients
- Stateless authentication needed

**Pros:**
- ✅ Stateless (no server-side storage needed)
- ✅ Scalable for distributed systems
- ✅ Works well with microservices
- ✅ Cross-domain authentication (CORS friendly)
- ✅ Mobile-friendly
- ✅ Can contain user claims/permissions
- ✅ Self-contained (all info in token)

**Cons:**
- ❌ Cannot be invalidated before expiration (unless using blacklist)
- ❌ Token size larger than session ID
- ❌ Vulnerable if stored in localStorage (XSS attacks)
- ❌ Needs refresh token mechanism for long-lived sessions
- ❌ Token payload is readable (base64 encoded, not encrypted)

---

### 3. API Key Authentication

**How it works:**
1. Server generates a unique API key for each client/user
2. Client includes API key in request headers or query parameters
3. Server validates the API key against stored keys
4. Server grants or denies access based on key validity

**Example Implementation:**

```javascript
import express from 'express'
import crypto from 'crypto'

const app = express()

// Generate API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex')
}

// Create API key
app.post('/api-keys', authenticateUser, async (req, res) => {
  const { name, permissions } = req.body

  const apiKey = generateApiKey()

  // Store in database
  await db.apiKeys.create({
    key: apiKey,
    userId: req.user.id,
    name,
    permissions,
    createdAt: new Date()
  })

  res.json({ apiKey, message: 'API key created' })
})

// API Key authentication middleware
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' })
  }

  // Validate API key
  const keyData = await db.apiKeys.findByKey(apiKey)

  if (!keyData) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  // Check if key is active
  if (!keyData.isActive) {
    return res.status(401).json({ error: 'API key is disabled' })
  }

  // Attach user/app data to request
  req.apiKey = keyData
  req.user = await db.users.findById(keyData.userId)

  next()
}

// Protected API endpoint
app.get('/api/data', authenticateApiKey, (req, res) => {
  res.json({ data: 'Protected data', apiKey: req.apiKey.name })
})

// Rate limiting per API key
app.use('/api', rateLimitByApiKey)

function rateLimitByApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key']

  // Check rate limit for this API key
  const limit = checkRateLimit(apiKey)

  if (limit.exceeded) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  next()
}
```

**When to Use:**
- Third-party API integrations
- Server-to-server communication
- Webhooks
- Public APIs with usage tracking
- Automated scripts/bots

**Pros:**
- ✅ Simple to implement
- ✅ Easy to revoke access
- ✅ Good for tracking API usage
- ✅ No user interaction needed
- ✅ Long-lived credentials
- ✅ Easy rate limiting per key

**Cons:**
- ❌ If compromised, full access until revoked
- ❌ No expiration by default
- ❌ Should not be used for end-user authentication
- ❌ Difficult to rotate safely
- ❌ No built-in permissions/scopes (need custom implementation)
- ❌ Can be accidentally exposed in URLs or logs

---

### 4. OAuth 2.0 / OpenID Connect

**How it works:**
1. User clicks "Login with Google/GitHub/etc."
2. User is redirected to OAuth provider
3. User grants permissions
4. Provider redirects back with authorization code
5. Server exchanges code for access token
6. Server uses access token to get user info
7. Server creates session or JWT for user

**Example Implementation:**

```javascript
import express from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

const app = express()

// Configure passport with Google strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    // Find or create user in database
    let user = await db.users.findByGoogleId(profile.id)

    if (!user) {
      user = await db.users.create({
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos[0].value
      })
    }

    return done(null, user)
  }
))

// Initialize routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication
    const token = generateJWT(req.user)
    res.redirect(`/dashboard?token=${token}`)
  }
)

// GitHub OAuth example
import { Strategy as GitHubStrategy } from 'passport-github2'

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/auth/github/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    let user = await db.users.findByGitHubId(profile.id)

    if (!user) {
      user = await db.users.create({
        githubId: profile.id,
        username: profile.username,
        email: profile.emails?.[0]?.value,
        avatar: profile.photos?.[0]?.value
      })
    }

    return done(null, user)
  }
))
```

**When to Use:**
- Social login (Google, Facebook, GitHub, etc.)
- Enterprise SSO (Single Sign-On)
- Third-party applications accessing your API
- When you don't want to manage passwords
- Multi-tenant applications

**Pros:**
- ✅ No password management needed
- ✅ Leverages existing user accounts
- ✅ Better user experience (one-click login)
- ✅ Delegated authentication
- ✅ Standard protocol with wide support
- ✅ Scoped permissions
- ✅ Reduced security liability

**Cons:**
- ❌ Dependency on third-party provider
- ❌ Complex implementation
- ❌ Privacy concerns (data sharing)
- ❌ Provider downtime affects your app
- ❌ May require additional user data mapping
- ❌ Callback URLs and redirect flows can be tricky

---

### 5. Basic Authentication

**How it works:**
1. Client sends credentials encoded in Base64 in Authorization header
2. Server decodes and validates credentials
3. Server grants or denies access

**Example Implementation:**

```javascript
import express from 'express'
import bcrypt from 'bcrypt'

const app = express()

// Basic auth middleware
async function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization']

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
    return res.status(401).json({ error: 'Authentication required' })
  }

  // Decode Base64 credentials
  const base64Credentials = authHeader.split(' ')[1]
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
  const [username, password] = credentials.split(':')

  // Validate credentials
  const user = await db.users.findByUsername(username)

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  req.user = user
  next()
}

// Protected route
app.get('/admin', basicAuth, (req, res) => {
  res.json({ message: 'Welcome to admin area', user: req.user.username })
})
```

**When to Use:**
- Simple internal tools
- Development/testing environments
- Quick prototypes
- Legacy system integration
- When HTTPS is guaranteed

**Pros:**
- ✅ Extremely simple to implement
- ✅ Built into HTTP standard
- ✅ No session management needed
- ✅ Browser support (shows login prompt)

**Cons:**
- ❌ Credentials sent with every request
- ❌ Must use HTTPS (credentials in header)
- ❌ No logout mechanism
- ❌ Not suitable for modern web apps
- ❌ No built-in CSRF protection
- ❌ Browser caches credentials

---

### 6. Token-Based Authentication (Non-JWT)

**How it works:**
1. User logs in with credentials
2. Server generates random token and stores it
3. Client receives and stores token
4. Client sends token with each request
5. Server validates token against database

**Example Implementation:**

```javascript
import express from 'express'
import crypto from 'crypto'

const app = express()

// Generate secure random token
function generateToken() {
  return crypto.randomBytes(64).toString('hex')
}

// Login and create token
app.post('/login', async (req, res) => {
  const { email, password } = req.body

  const user = await validateUser(email, password)

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Generate token
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Store token in database
  await db.tokens.create({
    token,
    userId: user.id,
    expiresAt,
    createdAt: new Date()
  })

  res.json({ token, expiresAt })
})

// Token authentication middleware
async function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Token required' })
  }

  // Find token in database
  const tokenData = await db.tokens.findByToken(token)

  if (!tokenData) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Check expiration
  if (new Date() > tokenData.expiresAt) {
    await db.tokens.delete(token)
    return res.status(401).json({ error: 'Token expired' })
  }

  // Load user
  req.user = await db.users.findById(tokenData.userId)
  next()
}

// Logout (invalidate token)
app.post('/logout', authenticateToken, async (req, res) => {
  const token = req.headers['authorization'].split(' ')[1]
  await db.tokens.delete(token)
  res.json({ message: 'Logged out successfully' })
})
```

**When to Use:**
- When you need to invalidate tokens server-side
- Mobile applications
- When JWT limitations are problematic
- Personal access tokens for APIs

**Pros:**
- ✅ Easy to invalidate
- ✅ Server controls token lifecycle
- ✅ Can track token usage
- ✅ Simple to implement
- ✅ Flexible expiration policies

**Cons:**
- ❌ Requires database lookup for each request
- ❌ Not stateless
- ❌ Scalability concerns with high traffic
- ❌ Need token cleanup/garbage collection

---

### 7. Certificate-Based Authentication (mTLS)

**How it works:**
1. Client has SSL/TLS certificate
2. During TLS handshake, client presents certificate
3. Server validates certificate against trusted CA
4. Connection established if certificate is valid

**Example Implementation:**

```javascript
import https from 'https'
import fs from 'fs'
import express from 'express'

const app = express()

// HTTPS server with client certificate validation
const httpsOptions = {
  key: fs.readFileSync('server-key.pem'),
  cert: fs.readFileSync('server-cert.pem'),
  ca: fs.readFileSync('ca-cert.pem'),
  requestCert: true,
  rejectUnauthorized: true
}

// Middleware to extract client cert info
function clientCertAuth(req, res, next) {
  const cert = req.socket.getPeerCertificate()

  if (!req.client.authorized) {
    return res.status(401).json({ error: 'Invalid certificate' })
  }

  req.user = {
    commonName: cert.subject.CN,
    organization: cert.subject.O,
    fingerprint: cert.fingerprint
  }

  next()
}

app.get('/secure', clientCertAuth, (req, res) => {
  res.json({ message: 'Authenticated via certificate', user: req.user })
})

https.createServer(httpsOptions, app).listen(443)
```

**When to Use:**
- High-security environments
- Banking/financial systems
- IoT device authentication
- Government systems
- Internal enterprise services

**Pros:**
- ✅ Very high security
- ✅ Mutual authentication (both client and server)
- ✅ No credentials to steal
- ✅ Built into TLS protocol
- ✅ Non-repudiation

**Cons:**
- ❌ Complex setup and management
- ❌ Certificate distribution challenges
- ❌ Not user-friendly
- ❌ Revocation can be difficult
- ❌ Requires PKI infrastructure

---

### 8. Biometric Authentication

**How it works:**
1. User registers biometric data (fingerprint, face, etc.)
2. Device captures biometric sample
3. Device validates against stored template
4. Device sends authentication result to server
5. Server creates session/token

**Example Implementation:**

```javascript
// Client-side (using WebAuthn API)
// Registration
async function registerBiometric() {
  const publicKey = {
    challenge: new Uint8Array(32), // from server
    rp: { name: "My App" },
    user: {
      id: new Uint8Array(16),
      name: "user@example.com",
      displayName: "User Name"
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required"
    }
  }

  const credential = await navigator.credentials.create({ publicKey })
  // Send credential to server for storage
}

// Server-side
app.post('/auth/webauthn/register', async (req, res) => {
  const { credential, userId } = req.body

  // Verify and store credential
  await db.credentials.create({
    userId,
    credentialId: credential.id,
    publicKey: credential.response.publicKey,
    counter: 0
  })

  res.json({ success: true })
})

app.post('/auth/webauthn/authenticate', async (req, res) => {
  const { assertion } = req.body

  // Verify assertion
  const credential = await db.credentials.findById(assertion.id)

  if (verifyAssertion(assertion, credential)) {
    const token = generateJWT({ userId: credential.userId })
    res.json({ token })
  } else {
    res.status(401).json({ error: 'Authentication failed' })
  }
})
```

**When to Use:**
- Mobile applications
- High-security applications
- Passwordless authentication
- Modern web applications (WebAuthn)

**Pros:**
- ✅ High security (biometrics hard to fake)
- ✅ Great user experience
- ✅ No passwords to remember
- ✅ Difficult to phish
- ✅ Fast authentication

**Cons:**
- ❌ Requires specific hardware
- ❌ Privacy concerns
- ❌ Cannot be changed if compromised
- ❌ False positives/negatives possible
- ❌ Not universally supported
- ❌ Fallback method still needed

---

### 9. Magic Link / Passwordless Authentication

**How it works:**
1. User enters email address
2. Server generates one-time token
3. Server sends email with magic link
4. User clicks link
5. Server validates token and creates session

**Example Implementation:**

```javascript
import express from 'express'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

const app = express()

// Request magic link
app.post('/auth/magic-link', async (req, res) => {
  const { email } = req.body

  const user = await db.users.findByEmail(email)

  if (!user) {
    // Don't reveal if user exists
    return res.json({ message: 'Check your email' })
  }

  // Generate one-time token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

  // Store token
  await db.magicTokens.create({
    token,
    userId: user.id,
    expiresAt,
    used: false
  })

  // Send email
  const magicLink = `${process.env.APP_URL}/auth/verify?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Login to Your Account',
    html: `<a href="${magicLink}">Click here to login</a>`
  })

  res.json({ message: 'Check your email' })
})

// Verify magic link
app.get('/auth/verify', async (req, res) => {
  const { token } = req.query

  const magicToken = await db.magicTokens.findByToken(token)

  if (!magicToken || magicToken.used || new Date() > magicToken.expiresAt) {
    return res.status(400).json({ error: 'Invalid or expired token' })
  }

  // Mark token as used
  await db.magicTokens.markAsUsed(token)

  // Create session or JWT
  const user = await db.users.findById(magicToken.userId)
  const authToken = generateJWT(user)

  res.redirect(`/dashboard?token=${authToken}`)
})
```

**When to Use:**
- User-friendly applications
- When you want to eliminate passwords
- Email-based workflows
- Temporary access links

**Pros:**
- ✅ No password management
- ✅ Great user experience
- ✅ Reduces password-related security issues
- ✅ Simple for users
- ✅ Phishing resistant

**Cons:**
- ❌ Requires email access
- ❌ Email delivery delays
- ❌ Email can be intercepted
- ❌ Not suitable for frequent logins
- ❌ Depends on email service reliability

---

### 10. Multi-Factor Authentication (MFA)

**How it works:**
1. User provides first factor (password)
2. Server validates and requests second factor
3. User provides second factor (OTP, SMS, etc.)
4. Server validates both factors
5. Server grants access

**Example Implementation:**

```javascript
import express from 'express'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'

const app = express()

// Enable TOTP-based MFA
app.post('/auth/mfa/setup', authenticateUser, async (req, res) => {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `MyApp (${req.user.email})`
  })

  // Store secret in database
  await db.users.update(req.user.id, {
    mfaSecret: secret.base32,
    mfaEnabled: false // Enable after verification
  })

  // Generate QR code
  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url)

  res.json({
    secret: secret.base32,
    qrCode: qrCodeUrl
  })
})

// Verify and enable MFA
app.post('/auth/mfa/verify', authenticateUser, async (req, res) => {
  const { token } = req.body

  const user = await db.users.findById(req.user.id)

  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 2
  })

  if (verified) {
    await db.users.update(user.id, { mfaEnabled: true })
    res.json({ message: 'MFA enabled successfully' })
  } else {
    res.status(400).json({ error: 'Invalid code' })
  }
})

// Login with MFA
app.post('/auth/login', async (req, res) => {
  const { email, password, mfaToken } = req.body

  const user = await validateUser(email, password)

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Check if MFA is enabled
  if (user.mfaEnabled) {
    if (!mfaToken) {
      return res.status(200).json({
        mfaRequired: true,
        message: 'Please provide MFA code'
      })
    }

    // Verify MFA token
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: mfaToken,
      window: 2
    })

    if (!verified) {
      return res.status(401).json({ error: 'Invalid MFA code' })
    }
  }

  // Generate auth token
  const token = generateJWT(user)
  res.json({ token })
})
```

**When to Use:**
- High-security applications
- Financial services
- Healthcare applications
- Admin panels
- Any application handling sensitive data

**Pros:**
- ✅ Significantly increased security
- ✅ Protection against password theft
- ✅ Compliance with security standards
- ✅ Multiple factor options
- ✅ Defense against phishing

**Cons:**
- ❌ Additional friction for users
- ❌ Can be lost/forgotten
- ❌ Recovery process needed
- ❌ More complex implementation
- ❌ May require external services (SMS, etc.)

---

## Comparison Table

| Method | Security | Complexity | Scalability | Use Case | Stateful |
|--------|----------|------------|-------------|----------|----------|
| Session-based | Medium-High | Low | Medium | Traditional web apps | Yes |
| JWT | Medium-High | Medium | High | SPAs, Mobile, APIs | No |
| API Key | Low-Medium | Low | High | Service-to-service | Yes |
| OAuth 2.0 | High | High | High | Social login, SSO | Varies |
| Basic Auth | Low | Very Low | High | Simple tools, legacy | No |
| Token-based | Medium | Low | Medium | Mobile apps | Yes |
| mTLS | Very High | Very High | High | Enterprise, IoT | No |
| Biometric | Very High | High | Medium | Mobile, modern web | Varies |
| Magic Link | Medium | Medium | High | Passwordless | Yes |
| MFA | Very High | Medium-High | High | High security needs | Varies |

---

## Best Practices

### General Security
1. **Always use HTTPS** - Encrypt data in transit
2. **Hash passwords** - Use bcrypt, argon2, or scrypt
3. **Implement rate limiting** - Prevent brute force attacks
4. **Use secure session configuration** - httpOnly, secure, sameSite cookies
5. **Validate input** - Prevent injection attacks
6. **Implement CSRF protection** - For session-based auth
7. **Store sensitive data securely** - Never log tokens/passwords
8. **Use environment variables** - For secrets and keys
9. **Implement proper error handling** - Don't leak information
10. **Regular security audits** - Keep dependencies updated

### Token Management
1. **Short-lived access tokens** - 15-30 minutes
2. **Long-lived refresh tokens** - Store securely server-side
3. **Token rotation** - Issue new tokens on refresh
4. **Blacklist/whitelist** - For token invalidation
5. **Secure storage** - Never in localStorage for sensitive apps

### Password Policies
1. **Minimum length** - At least 8-12 characters
2. **Complexity requirements** - Mix of character types
3. **Password strength meter** - User feedback
4. **Prevent common passwords** - Use password blacklist
5. **Account lockout** - After failed attempts
6. **Password reset** - Secure recovery mechanism

### Monitoring & Logging
1. **Log authentication attempts** - Track failures
2. **Monitor suspicious activity** - Unusual patterns
3. **Alert on security events** - Failed logins, password changes
4. **Audit trails** - For compliance
5. **Regular review** - Analyze logs for threats
