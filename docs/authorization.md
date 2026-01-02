# Authorization in Node.js

Authorization is the process of determining what actions an authenticated user is allowed to perform. It answers the question: "What can you do?"

## Table of Contents
- [Authorization vs Authentication](#authorization-vs-authentication)
- [Authorization Models](#authorization-models)
  - [1. Role-Based Access Control (RBAC)](#1-role-based-access-control-rbac)
  - [2. Attribute-Based Access Control (ABAC)](#2-attribute-based-access-control-abac)
  - [3. Access Control Lists (ACL)](#3-access-control-lists-acl)
  - [4. Permission-Based Authorization](#4-permission-based-authorization)
  - [5. Resource-Based Authorization](#5-resource-based-authorization)
  - [6. Claim-Based Authorization](#6-claim-based-authorization)
  - [7. Policy-Based Authorization](#7-policy-based-authorization)
- [Implementation Patterns](#implementation-patterns)
- [Best Practices](#best-practices)

---

## Authorization vs Authentication

| Aspect | Authentication | Authorization |
|--------|---------------|---------------|
| **Purpose** | Verify identity | Verify permissions |
| **Question** | "Who are you?" | "What can you do?" |
| **When** | First (login) | After authentication |
| **Example** | Password check | Role/permission check |
| **Failure** | 401 Unauthorized | 403 Forbidden |

---

## Authorization Models

### 1. Role-Based Access Control (RBAC)

**Concept:** Users are assigned roles, and roles have specific permissions. Access is granted based on user roles.

**When to Use:**
- Most web applications
- When permissions align with job functions
- When you have clear role hierarchies
- Medium complexity applications

**Example Implementation:**

```javascript
import express from 'express'

const app = express()

// Database schema for roles
const roles = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  USER: 'user'
}

const rolePermissions = {
  admin: ['read', 'write', 'delete', 'manage_users', 'manage_roles'],
  editor: ['read', 'write', 'delete'],
  viewer: ['read'],
  user: ['read']
}

// Role hierarchy
const roleHierarchy = {
  admin: ['admin', 'editor', 'viewer', 'user'],
  editor: ['editor', 'viewer', 'user'],
  viewer: ['viewer', 'user'],
  user: ['user']
}

// Authorization middleware - check if user has required role
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userRole = req.user.role

    // Check if user role is in allowed roles
    const hasRole = allowedRoles.some(role => {
      return roleHierarchy[userRole]?.includes(role)
    })

    if (!hasRole) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole
      })
    }

    next()
  }
}

// Check if user has specific permission
function hasPermission(userRole, permission) {
  return rolePermissions[userRole]?.includes(permission) || false
}

// Permission-based middleware
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userPermissions = rolePermissions[req.user.role] || []

    const hasAllPermissions = permissions.every(permission =>
      userPermissions.includes(permission)
    )

    if (!hasAllPermissions) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions
      })
    }

    next()
  }
}

// Routes with role-based authorization
app.get('/admin/users',
  authenticateToken,
  requireRole(roles.ADMIN),
  async (req, res) => {
    const users = await db.users.findAll()
    res.json(users)
  }
)

app.post('/posts',
  authenticateToken,
  requireRole(roles.ADMIN, roles.EDITOR),
  async (req, res) => {
    const post = await db.posts.create(req.body)
    res.json(post)
  }
)

app.get('/posts',
  authenticateToken,
  requireRole(roles.ADMIN, roles.EDITOR, roles.VIEWER, roles.USER),
  async (req, res) => {
    const posts = await db.posts.findAll()
    res.json(posts)
  }
)

app.delete('/posts/:id',
  authenticateToken,
  requirePermission('delete'),
  async (req, res) => {
    await db.posts.delete(req.params.id)
    res.json({ message: 'Post deleted' })
  }
)

// Assign role to user
app.post('/users/:id/role',
  authenticateToken,
  requireRole(roles.ADMIN),
  async (req, res) => {
    const { role } = req.body

    if (!Object.values(roles).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    await db.users.update(req.params.id, { role })
    res.json({ message: 'Role updated' })
  }
)
```

**Database Schema:**

```javascript
// Users table
{
  id: uuid,
  email: string,
  password: string,
  role: string, // 'admin', 'editor', 'viewer', 'user'
  createdAt: timestamp
}

// Or with separate roles table
// users table
{
  id: uuid,
  email: string,
  password: string
}

// roles table
{
  id: uuid,
  name: string, // 'admin', 'editor', etc.
  description: string
}

// user_roles table
{
  userId: uuid,
  roleId: uuid
}
```

**Pros:**
- ✅ Simple to understand and implement
- ✅ Easy to manage (assign users to roles)
- ✅ Good for most applications
- ✅ Clear separation of concerns
- ✅ Easy to audit

**Cons:**
- ❌ Role explosion in complex systems
- ❌ Hard to handle exceptions
- ❌ Limited granularity
- ❌ Difficult to share resources across roles

---

### 2. Attribute-Based Access Control (ABAC)

**Concept:** Access decisions based on attributes of users, resources, and environment. More flexible than RBAC.

**When to Use:**
- Complex authorization requirements
- Multi-tenant applications
- When context matters (time, location, etc.)
- Dynamic access control needs
- Enterprise applications

**Example Implementation:**

```javascript
import express from 'express'

const app = express()

// Policy engine
class PolicyEngine {
  constructor() {
    this.policies = []
  }

  addPolicy(policy) {
    this.policies.push(policy)
  }

  async evaluate(subject, action, resource, context = {}) {
    for (const policy of this.policies) {
      const result = await policy.evaluate(subject, action, resource, context)

      if (result === 'deny') {
        return false
      }

      if (result === 'allow') {
        return true
      }
    }

    // Default deny
    return false
  }
}

const policyEngine = new PolicyEngine()

// Example policies
class DocumentAccessPolicy {
  async evaluate(subject, action, resource, context) {
    // Owner can do anything
    if (resource.ownerId === subject.id) {
      return 'allow'
    }

    // Admins can read and write
    if (subject.role === 'admin' && ['read', 'write'].includes(action)) {
      return 'allow'
    }

    // Department members can read if document is in their department
    if (
      action === 'read' &&
      subject.department === resource.department
    ) {
      return 'allow'
    }

    // Can read if document is public
    if (action === 'read' && resource.isPublic) {
      return 'allow'
    }

    // Deny during business hours for certain actions
    if (
      action === 'delete' &&
      context.time >= 9 && context.time <= 17
    ) {
      return 'deny'
    }

    return 'neutral'
  }
}

policyEngine.addPolicy(new DocumentAccessPolicy())

// ABAC middleware
function abacAuthorize(action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resource = await getResource(req) // Get resource from request
    const context = {
      time: new Date().getHours(),
      ip: req.ip,
      location: req.headers['x-location']
    }

    const allowed = await policyEngine.evaluate(
      req.user,
      action,
      resource,
      context
    )

    if (!allowed) {
      return res.status(403).json({
        error: 'Access denied',
        reason: 'Policy evaluation failed'
      })
    }

    next()
  }
}

// Routes
app.get('/documents/:id',
  authenticateToken,
  abacAuthorize('read'),
  async (req, res) => {
    const document = await db.documents.findById(req.params.id)
    res.json(document)
  }
)

app.put('/documents/:id',
  authenticateToken,
  abacAuthorize('write'),
  async (req, res) => {
    const document = await db.documents.update(req.params.id, req.body)
    res.json(document)
  }
)

app.delete('/documents/:id',
  authenticateToken,
  abacAuthorize('delete'),
  async (req, res) => {
    await db.documents.delete(req.params.id)
    res.json({ message: 'Document deleted' })
  }
)

// Helper function to get resource
async function getResource(req) {
  if (req.params.id) {
    return await db.documents.findById(req.params.id)
  }
  return null
}
```

**Example with Casbin (Policy Engine):**

```javascript
import { newEnforcer } from 'casbin'
import path from 'path'

// Initialize Casbin enforcer
const enforcer = await newEnforcer(
  path.join(__dirname, 'model.conf'),
  path.join(__dirname, 'policy.csv')
)

// model.conf
/*
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
*/

// policy.csv
/*
p, alice, data1, read
p, alice, data1, write
p, bob, data2, read
p, admin, *, *
g, alice, admin
*/

// Middleware
function casbinAuthorize(obj, act) {
  return async (req, res, next) => {
    const sub = req.user.username

    const allowed = await enforcer.enforce(sub, obj, act)

    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' })
    }

    next()
  }
}

// Usage
app.get('/data/:id',
  authenticateToken,
  casbinAuthorize('data1', 'read'),
  (req, res) => {
    res.json({ data: 'sensitive data' })
  }
)
```

**Pros:**
- ✅ Extremely flexible
- ✅ Fine-grained control
- ✅ Handles complex scenarios
- ✅ Context-aware decisions
- ✅ Easy to add new conditions

**Cons:**
- ❌ Complex to implement
- ❌ Harder to understand and debug
- ❌ Performance overhead
- ❌ Difficult to audit
- ❌ Can be over-engineered

---

### 3. Access Control Lists (ACL)

**Concept:** Each resource has a list of users/groups and their permissions. Direct mapping of subjects to objects.

**When to Use:**
- File systems
- Shared resources
- Collaborative applications
- When you need resource-specific permissions
- Small to medium scale

**Example Implementation:**

```javascript
import express from 'express'

const app = express()

// ACL structure in database
/*
document_acl table:
{
  id: uuid,
  documentId: uuid,
  userId: uuid,
  permission: string // 'read', 'write', 'delete', 'share'
}
*/

// ACL Manager class
class ACLManager {
  async checkPermission(userId, resourceId, permission) {
    const acl = await db.acl.findOne({
      where: {
        resourceId,
        userId,
        permission
      }
    })

    return !!acl
  }

  async grantPermission(userId, resourceId, permission) {
    await db.acl.create({
      resourceId,
      userId,
      permission
    })
  }

  async revokePermission(userId, resourceId, permission) {
    await db.acl.delete({
      where: {
        resourceId,
        userId,
        permission
      }
    })
  }

  async getResourcePermissions(resourceId) {
    return await db.acl.findAll({
      where: { resourceId }
    })
  }

  async getUserPermissions(userId, resourceId) {
    const acls = await db.acl.findAll({
      where: { resourceId, userId }
    })

    return acls.map(acl => acl.permission)
  }
}

const aclManager = new ACLManager()

// Middleware to check ACL
function checkACL(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resourceId = req.params.id

    const hasPermission = await aclManager.checkPermission(
      req.user.id,
      resourceId,
      permission
    )

    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied' })
    }

    next()
  }
}

// Routes
app.get('/documents/:id',
  authenticateToken,
  checkACL('read'),
  async (req, res) => {
    const document = await db.documents.findById(req.params.id)
    res.json(document)
  }
)

app.put('/documents/:id',
  authenticateToken,
  checkACL('write'),
  async (req, res) => {
    const document = await db.documents.update(req.params.id, req.body)
    res.json(document)
  }
)

// Share document with another user
app.post('/documents/:id/share',
  authenticateToken,
  checkACL('share'),
  async (req, res) => {
    const { userId, permission } = req.body

    await aclManager.grantPermission(userId, req.params.id, permission)

    res.json({ message: 'Document shared successfully' })
  }
)

// Get document permissions
app.get('/documents/:id/permissions',
  authenticateToken,
  checkACL('read'),
  async (req, res) => {
    const permissions = await aclManager.getResourcePermissions(req.params.id)
    res.json(permissions)
  }
)

// Revoke access
app.delete('/documents/:id/permissions/:userId',
  authenticateToken,
  checkACL('share'),
  async (req, res) => {
    const { userId } = req.params
    const { permission } = req.body

    await aclManager.revokePermission(userId, req.params.id, permission)

    res.json({ message: 'Permission revoked' })
  }
)
```

**Using a Library (node-acl):**

```javascript
import acl from 'acl'
import redis from 'redis'

const redisClient = redis.createClient()
const aclInstance = new acl(new acl.redisBackend(redisClient))

// Define roles and permissions
await aclInstance.allow([
  {
    roles: 'admin',
    allows: [
      { resources: 'documents', permissions: '*' },
      { resources: 'users', permissions: '*' }
    ]
  },
  {
    roles: 'user',
    allows: [
      { resources: 'documents', permissions: ['read', 'create'] }
    ]
  }
])

// Assign role to user
await aclInstance.addUserRoles('user123', 'admin')

// Check permission
const isAllowed = await aclInstance.isAllowed('user123', 'documents', 'delete')

// Middleware
function aclMiddleware(resource, permission) {
  return async (req, res, next) => {
    const allowed = await aclInstance.isAllowed(
      req.user.id,
      resource,
      permission
    )

    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' })
    }

    next()
  }
}
```

**Pros:**
- ✅ Fine-grained per-resource control
- ✅ Easy to understand (explicit permissions)
- ✅ Good for shared resources
- ✅ Flexible sharing
- ✅ Direct permission management

**Cons:**
- ❌ Can become complex at scale
- ❌ Hard to manage for many resources
- ❌ ACL list can grow large
- ❌ Difficult to audit across resources
- ❌ Performance issues with large ACLs

---

### 4. Permission-Based Authorization

**Concept:** Users have specific permissions rather than roles. More granular than RBAC.

**When to Use:**
- When roles are too coarse
- Need fine-grained control
- Permissions don't align with roles
- Complex permission requirements

**Example Implementation:**

```javascript
import express from 'express'

const app = express()

// Permission definitions
const permissions = {
  // User management
  CREATE_USER: 'users:create',
  READ_USER: 'users:read',
  UPDATE_USER: 'users:update',
  DELETE_USER: 'users:delete',

  // Post management
  CREATE_POST: 'posts:create',
  READ_POST: 'posts:read',
  UPDATE_POST: 'posts:update',
  DELETE_POST: 'posts:delete',
  PUBLISH_POST: 'posts:publish',

  // Comment management
  CREATE_COMMENT: 'comments:create',
  DELETE_COMMENT: 'comments:delete',
  MODERATE_COMMENT: 'comments:moderate'
}

// Database schema
/*
permissions table:
{
  id: uuid,
  name: string,
  description: string
}

user_permissions table:
{
  userId: uuid,
  permissionId: uuid
}

role_permissions table (optional):
{
  roleId: uuid,
  permissionId: uuid
}
*/

// Permission checker
class PermissionChecker {
  async userHasPermission(userId, permissionName) {
    const userPermissions = await db.userPermissions.findAll({
      where: { userId },
      include: ['permission']
    })

    return userPermissions.some(up => up.permission.name === permissionName)
  }

  async userHasAllPermissions(userId, permissionNames) {
    const userPermissions = await db.userPermissions.findAll({
      where: { userId },
      include: ['permission']
    })

    const userPermissionNames = userPermissions.map(up => up.permission.name)

    return permissionNames.every(p => userPermissionNames.includes(p))
  }

  async userHasAnyPermission(userId, permissionNames) {
    const userPermissions = await db.userPermissions.findAll({
      where: { userId },
      include: ['permission']
    })

    const userPermissionNames = userPermissions.map(up => up.permission.name)

    return permissionNames.some(p => userPermissionNames.includes(p))
  }

  async grantPermission(userId, permissionName) {
    const permission = await db.permissions.findOne({
      where: { name: permissionName }
    })

    await db.userPermissions.create({
      userId,
      permissionId: permission.id
    })
  }

  async revokePermission(userId, permissionName) {
    const permission = await db.permissions.findOne({
      where: { name: permissionName }
    })

    await db.userPermissions.delete({
      where: { userId, permissionId: permission.id }
    })
  }
}

const permissionChecker = new PermissionChecker()

// Middleware
function requirePermissions(...requiredPermissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const hasPermissions = await permissionChecker.userHasAllPermissions(
      req.user.id,
      requiredPermissions
    )

    if (!hasPermissions) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions
      })
    }

    next()
  }
}

function requireAnyPermission(...requiredPermissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const hasPermission = await permissionChecker.userHasAnyPermission(
      req.user.id,
      requiredPermissions
    )

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions
      })
    }

    next()
  }
}

// Routes
app.post('/users',
  authenticateToken,
  requirePermissions(permissions.CREATE_USER),
  async (req, res) => {
    const user = await db.users.create(req.body)
    res.json(user)
  }
)

app.delete('/users/:id',
  authenticateToken,
  requirePermissions(permissions.DELETE_USER),
  async (req, res) => {
    await db.users.delete(req.params.id)
    res.json({ message: 'User deleted' })
  }
)

app.post('/posts',
  authenticateToken,
  requirePermissions(permissions.CREATE_POST),
  async (req, res) => {
    const post = await db.posts.create({
      ...req.body,
      authorId: req.user.id
    })
    res.json(post)
  }
)

app.put('/posts/:id/publish',
  authenticateToken,
  requirePermissions(permissions.PUBLISH_POST),
  async (req, res) => {
    const post = await db.posts.update(req.params.id, { published: true })
    res.json(post)
  }
)

// Grant permission to user
app.post('/users/:id/permissions',
  authenticateToken,
  requirePermissions(permissions.UPDATE_USER),
  async (req, res) => {
    const { permission } = req.body

    await permissionChecker.grantPermission(req.params.id, permission)

    res.json({ message: 'Permission granted' })
  }
)

// Get user permissions
app.get('/users/:id/permissions',
  authenticateToken,
  requireAnyPermission(permissions.READ_USER),
  async (req, res) => {
    const permissions = await db.userPermissions.findAll({
      where: { userId: req.params.id },
      include: ['permission']
    })

    res.json(permissions)
  }
)
```

**Pros:**
- ✅ Very fine-grained control
- ✅ Flexible permission assignment
- ✅ Clear permission semantics
- ✅ Easy to understand what user can do
- ✅ Can combine with roles

**Cons:**
- ❌ Can be overwhelming with many permissions
- ❌ More complex to manage than roles
- ❌ Requires careful planning
- ❌ Can lead to permission sprawl

---

### 5. Resource-Based Authorization

**Concept:** Authorization based on ownership or relationship to a specific resource.

**When to Use:**
- User-generated content
- Multi-tenant applications
- Collaborative platforms
- When ownership matters

**Example Implementation:**

```javascript
import express from 'express'

const app = express()

// Ownership checker
class OwnershipChecker {
  async isOwner(userId, resourceType, resourceId) {
    const resource = await db[resourceType].findById(resourceId)

    if (!resource) {
      return false
    }

    // Check direct ownership
    if (resource.userId === userId || resource.ownerId === userId) {
      return true
    }

    return false
  }

  async isCollaborator(userId, resourceType, resourceId) {
    const collaborator = await db.collaborators.findOne({
      where: {
        userId,
        resourceType,
        resourceId
      }
    })

    return !!collaborator
  }

  async canAccess(userId, resourceType, resourceId, action) {
    // Owner can do anything
    if (await this.isOwner(userId, resourceType, resourceId)) {
      return true
    }

    // Check collaborator permissions
    const collaborator = await db.collaborators.findOne({
      where: { userId, resourceType, resourceId }
    })

    if (collaborator) {
      return collaborator.permissions.includes(action)
    }

    return false
  }
}

const ownershipChecker = new OwnershipChecker()

// Middleware to check ownership
function requireOwnership(resourceType) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resourceId = req.params.id
    const isOwner = await ownershipChecker.isOwner(
      req.user.id,
      resourceType,
      resourceId
    )

    if (!isOwner) {
      return res.status(403).json({ error: 'You do not own this resource' })
    }

    next()
  }
}

// Middleware to check resource access
function requireResourceAccess(resourceType, action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resourceId = req.params.id
    const canAccess = await ownershipChecker.canAccess(
      req.user.id,
      resourceType,
      resourceId,
      action
    )

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' })
    }

    next()
  }
}

// Routes
app.put('/posts/:id',
  authenticateToken,
  requireOwnership('posts'),
  async (req, res) => {
    const post = await db.posts.update(req.params.id, req.body)
    res.json(post)
  }
)

app.delete('/posts/:id',
  authenticateToken,
  requireOwnership('posts'),
  async (req, res) => {
    await db.posts.delete(req.params.id)
    res.json({ message: 'Post deleted' })
  }
)

app.get('/documents/:id',
  authenticateToken,
  requireResourceAccess('documents', 'read'),
  async (req, res) => {
    const document = await db.documents.findById(req.params.id)
    res.json(document)
  }
)

// Add collaborator
app.post('/documents/:id/collaborators',
  authenticateToken,
  requireOwnership('documents'),
  async (req, res) => {
    const { userId, permissions } = req.body

    await db.collaborators.create({
      resourceType: 'documents',
      resourceId: req.params.id,
      userId,
      permissions
    })

    res.json({ message: 'Collaborator added' })
  }
)
```

**Pros:**
- ✅ Natural for user-generated content
- ✅ Clear ownership model
- ✅ Easy to understand
- ✅ Good for collaborative apps
- ✅ Intuitive for users

**Cons:**
- ❌ Doesn't handle all scenarios
- ❌ Complex for shared resources
- ❌ May need to combine with other models
- ❌ Can be bypassed if not implemented carefully

---

### 6. Claim-Based Authorization

**Concept:** Authorization based on claims (key-value pairs) in authentication tokens. Common with JWT.

**When to Use:**
- JWT-based authentication
- Stateless applications
- Microservices
- When claims can represent permissions

**Example Implementation:**

```javascript
import express from 'express'
import jwt from 'jsonwebtoken'

const app = express()

// Create JWT with claims
function createToken(user) {
  const claims = {
    userId: user.id,
    email: user.email,
    role: user.role,
    department: user.department,
    permissions: user.permissions,
    isVerified: user.isVerified,
    subscriptionLevel: user.subscriptionLevel
  }

  return jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '1h' })
}

// Middleware to check claims
function requireClaim(claimName, expectedValue) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const claimValue = req.user[claimName]

    if (claimValue !== expectedValue) {
      return res.status(403).json({
        error: 'Insufficient claims',
        required: { [claimName]: expectedValue },
        current: { [claimName]: claimValue }
      })
    }

    next()
  }
}

// Check if user has claim
function hasClaim(claimName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (!(claimName in req.user)) {
      return res.status(403).json({ error: `Missing claim: ${claimName}` })
    }

    next()
  }
}

// Check claim value against predicate
function requireClaimCondition(claimName, predicate) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const claimValue = req.user[claimName]

    if (!predicate(claimValue)) {
      return res.status(403).json({
        error: 'Claim condition not met',
        claim: claimName
      })
    }

    next()
  }
}

// Routes
app.get('/verified-users',
  authenticateToken,
  requireClaim('isVerified', true),
  async (req, res) => {
    res.json({ message: 'Access granted to verified users' })
  }
)

app.get('/premium/features',
  authenticateToken,
  requireClaimCondition('subscriptionLevel', level => level === 'premium'),
  async (req, res) => {
    res.json({ features: ['feature1', 'feature2', 'feature3'] })
  }
)

app.get('/department/data',
  authenticateToken,
  hasClaim('department'),
  async (req, res) => {
    const data = await db.departmentData.findByDepartment(req.user.department)
    res.json(data)
  }
)
```

**Pros:**
- ✅ Stateless (all info in token)
- ✅ Works well with JWT
- ✅ No database lookups needed
- ✅ Fast authorization checks
- ✅ Good for microservices

**Cons:**
- ❌ Cannot revoke without token blacklist
- ❌ Claims can become stale
- ❌ Token size increases with claims
- ❌ Need token refresh for claim updates
- ❌ Limited by token expiration

---

### 7. Policy-Based Authorization

**Concept:** Authorization decisions made by evaluating policies written in a policy language.

**When to Use:**
- Complex authorization logic
- Enterprise applications
- When authorization rules change frequently
- Externalized authorization

**Example with OPA (Open Policy Agent):**

```javascript
import express from 'express'
import axios from 'axios'

const app = express()

// OPA policy (written in Rego)
/*
package app.authz

default allow = false

# Allow admins to do anything
allow {
  input.user.role == "admin"
}

# Allow users to read their own data
allow {
  input.method == "GET"
  input.path = ["users", user_id]
  input.user.id == user_id
}

# Allow users to update their own profile
allow {
  input.method == "PUT"
  input.path = ["users", user_id, "profile"]
  input.user.id == user_id
}

# Department managers can read department data
allow {
  input.method == "GET"
  input.path = ["departments", dept_id]
  input.user.department == dept_id
  input.user.role == "manager"
}
*/

// OPA client
class OPAClient {
  constructor(baseURL) {
    this.baseURL = baseURL
  }

  async evaluate(input) {
    const response = await axios.post(
      `${this.baseURL}/v1/data/app/authz/allow`,
      { input }
    )

    return response.data.result
  }
}

const opaClient = new OPAClient('http://localhost:8181')

// Authorization middleware
function policyAuthorize() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const input = {
      user: req.user,
      method: req.method,
      path: req.path.split('/').filter(Boolean),
      query: req.query,
      body: req.body
    }

    const allowed = await opaClient.evaluate(input)

    if (!allowed) {
      return res.status(403).json({ error: 'Access denied by policy' })
    }

    next()
  }
}

// Apply to all routes
app.use(authenticateToken)
app.use(policyAuthorize())

// Routes
app.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id)
  res.json(user)
})

app.put('/users/:id/profile', async (req, res) => {
  const user = await db.users.update(req.params.id, req.body)
  res.json(user)
})

app.get('/departments/:id', async (req, res) => {
  const department = await db.departments.findById(req.params.id)
  res.json(department)
})
```

**Pros:**
- ✅ Centralized policy management
- ✅ Declarative authorization logic
- ✅ Easy to update policies
- ✅ Supports complex rules
- ✅ Auditable and testable
- ✅ Separation of concerns

**Cons:**
- ❌ Learning curve (policy language)
- ❌ Additional infrastructure (OPA server)
- ❌ Performance overhead
- ❌ Complexity for simple use cases
- ❌ Debugging can be difficult

---

## Implementation Patterns

### Combining Models

Most real-world applications use a combination of authorization models:

```javascript
// Example: RBAC + Resource ownership + Permissions

function authorize(action, resourceType) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resourceId = req.params.id

    // 1. Check if user is admin (RBAC)
    if (req.user.role === 'admin') {
      return next()
    }

    // 2. Check resource ownership
    const resource = await db[resourceType].findById(resourceId)
    if (resource && resource.userId === req.user.id) {
      return next()
    }

    // 3. Check specific permissions
    const hasPermission = await permissionChecker.userHasPermission(
      req.user.id,
      `${resourceType}:${action}`
    )

    if (hasPermission) {
      return next()
    }

    return res.status(403).json({ error: 'Access denied' })
  }
}
```

---

## Best Practices

### 1. Principle of Least Privilege
- Grant minimum necessary permissions
- Default deny approach
- Regular permission audits

### 2. Separation of Concerns
- Keep authentication and authorization separate
- Use middleware pattern
- Centralize authorization logic

### 3. Consistent Error Messages
```javascript
// Don't reveal why access was denied
res.status(403).json({ error: 'Access denied' })

// Instead of:
res.status(403).json({ error: 'You are not an admin' })
```

### 4. Audit Logging
```javascript
function auditLog(req, allowed) {
  logger.info({
    userId: req.user?.id,
    action: req.method,
    resource: req.path,
    allowed,
    timestamp: new Date()
  })
}
```

### 5. Caching
```javascript
// Cache permission checks
const permissionCache = new Map()

async function checkPermissionCached(userId, permission) {
  const key = `${userId}:${permission}`

  if (permissionCache.has(key)) {
    return permissionCache.get(key)
  }

  const result = await checkPermission(userId, permission)
  permissionCache.set(key, result)

  // Expire after 5 minutes
  setTimeout(() => permissionCache.delete(key), 5 * 60 * 1000)

  return result
}
```

### 6. Testing
```javascript
describe('Authorization', () => {
  it('should allow admin to delete users', async () => {
    const req = { user: { role: 'admin' } }
    const res = { status: jest.fn(), json: jest.fn() }
    const next = jest.fn()

    await requireRole('admin')(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('should deny non-admin from deleting users', async () => {
    const req = { user: { role: 'user' } }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    await requireRole('admin')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
```

### 7. Documentation
- Document all roles and permissions
- Maintain permission matrix
- Keep authorization model documented

### 8. HTTP Status Codes
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Consider for security (don't reveal resource exists)

---

## Summary

| Model | Complexity | Flexibility | Best For | Scalability |
|-------|------------|-------------|----------|-------------|
| RBAC | Low | Medium | Most apps | High |
| ABAC | High | Very High | Complex rules | Medium |
| ACL | Medium | High | Shared resources | Low-Medium |
| Permission-based | Medium | High | Fine-grained | High |
| Resource-based | Low | Medium | User content | High |
| Claim-based | Low | Medium | JWT/stateless | High |
| Policy-based | Very High | Very High | Enterprise | Medium |

Choose the authorization model(s) that best fit your application's requirements, and don't hesitate to combine multiple approaches for optimal results.
