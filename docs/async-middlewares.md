# Asynchronous Middlewares in Express.js

## Table of Contents
- [Introduction](#introduction)
- [Synchronous vs Asynchronous Middlewares](#synchronous-vs-asynchronous-middlewares)
- [Common Use Cases](#common-use-cases)
- [Error Handling in Async Middlewares](#error-handling-in-async-middlewares)
- [Best Practices](#best-practices)
- [Practical Examples](#practical-examples)

## Introduction

Asynchronous middlewares are essential when your middleware needs to perform I/O operations like:
- Database queries
- API calls to external services
- File system operations
- Authentication token verification
- Rate limiting checks

Express.js doesn't automatically handle errors thrown in async functions, so proper error handling is crucial.

## Synchronous vs Asynchronous Middlewares

### Synchronous Middleware
```typescript
// Simple synchronous middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next(); // Synchronously pass control to next middleware
});
```

### Asynchronous Middleware (Wrong Way ❌)
```typescript
// This will NOT catch errors properly!
app.use(async (req, res, next) => {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
  req.user = user;
  next();
  // If the query throws an error, Express won't catch it!
});
```

### Asynchronous Middleware (Correct Way ✅)
```typescript
// Method 1: Using try-catch
app.use(async (req, res, next) => {
  try {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    req.user = user;
    next();
  } catch (error) {
    next(error); // Pass error to Express error handler
  }
});

// Method 2: Using a wrapper function (recommended)
const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

app.use(asyncHandler(async (req, res, next) => {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
  req.user = user;
  next();
}));
```

#### 📚 Deep Dive: How asyncHandler Works

Let's break down the `asyncHandler` wrapper function step by step:

**The Problem It Solves:**
Express doesn't automatically catch errors in async functions. If an async middleware throws an error, it results in an unhandled promise rejection, and Express won't trigger your error handlers.

**The Solution - Step by Step:**

```typescript
const asyncHandler = (fn: Function) => {
  // Step 1: asyncHandler takes your async middleware function as a parameter

  return (req: Request, res: Response, next: NextFunction) => {
    // Step 2: Returns a new function that Express will actually use
    // This returned function matches Express's middleware signature

    Promise.resolve(fn(req, res, next)).catch(next);
    // Step 3: Executes your async function and catches any errors
  };
};
```

**Breaking Down Step 3 - The Magic Line:**

```typescript
Promise.resolve(fn(req, res, next)).catch(next);
```

1. **`fn(req, res, next)`** - Calls your async middleware function
   - Example: `async (req, res, next) => { await db.query(...) }`
   - Returns a Promise (all async functions return promises)

2. **`Promise.resolve(...)`** - Wraps the result in a Promise
   - If `fn` is already async, this ensures we have a Promise
   - If `fn` returns a value, it's wrapped in a resolved Promise
   - Makes the code defensive and consistent

3. **`.catch(next)`** - Catches any rejected promises (errors)
   - If your async function throws an error, `.catch()` catches it
   - Passes the error to `next(error)`, which triggers Express error handlers
   - This is the key: converting promise rejections into Express-compatible errors

**Visual Example:**

```typescript
// Your async middleware (what you write)
async (req, res, next) => {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
  // ^ If this fails, it throws an error
  req.user = user;
  next();
}

// What asyncHandler converts it to (conceptually)
(req, res, next) => {
  Promise.resolve(
    (async () => {
      const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
      req.user = user;
      next();
    })()
  )
  .catch((error) => {
    next(error); // Sends error to Express error handler
  });
}
```

**Execution Flow with Error:**

```typescript
app.use(asyncHandler(async (req, res, next) => {
  const user = await db.query('SELECT * FROM users'); // This throws an error!
  req.user = user;
  next();
}));

// Step-by-step execution:
// 1. asyncHandler is called with your async function
// 2. Returns a wrapper function to Express
// 3. Request comes in, wrapper executes
// 4. Promise.resolve() starts your async function
// 5. db.query() throws an error (Promise rejects)
// 6. .catch(next) catches the error
// 7. next(error) is called
// 8. Express error handler receives the error ✅
```

**Without asyncHandler (The Problem):**

```typescript
app.use(async (req, res, next) => {
  const user = await db.query('SELECT * FROM users'); // Throws error
  req.user = user;
  next();
});

// Step-by-step execution:
// 1. Request comes in
// 2. Async function executes
// 3. db.query() throws an error (Promise rejects)
// 4. ❌ Unhandled promise rejection!
// 5. ❌ Express error handler is NOT called
// 6. ❌ Server might crash or hang
```

**Why Promise.resolve() Instead of Just .catch()?**

```typescript
// This would work for async functions
return (req, res, next) => {
  fn(req, res, next).catch(next);
};

// But this is safer - handles both async and sync functions
return (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Example where Promise.resolve matters:
const syncFn = (req, res, next) => {
  throw new Error('Sync error'); // Not an async function
};

// Without Promise.resolve: error not caught
fn(req, res, next).catch(next); // ❌ Sync errors don't have .catch

// With Promise.resolve: error caught
Promise.resolve(fn(req, res, next)).catch(next); // ✅ Works for both
```

**Real-World Comparison:**

```typescript
// ❌ Without asyncHandler - Verbose and repetitive
app.use(async (req, res, next) => {
  try {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
});

app.use(async (req, res, next) => {
  try {
    const habits = await db.query('SELECT * FROM habits WHERE user_id = ?', [req.userId]);
    req.habits = habits;
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ With asyncHandler - Clean and DRY (Don't Repeat Yourself)
app.use(asyncHandler(async (req, res, next) => {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
  req.user = user;
  next();
}));

app.use(asyncHandler(async (req, res, next) => {
  const habits = await db.query('SELECT * FROM habits WHERE user_id = ?', [req.userId]);
  req.habits = habits;
  next();
}));
```

**Key Takeaways:**

1. `asyncHandler` is a **higher-order function** (takes a function, returns a function)
2. It wraps your async middleware to catch promise rejections
3. Converts async errors into Express-compatible error handling via `next(error)`
4. Eliminates the need for try-catch blocks in every async middleware
5. Makes your code cleaner, more maintainable, and less error-prone

**Pro Tip:** Many popular libraries provide this functionality:
- `express-async-handler` npm package
- `express-async-errors` (patches Express globally)
- Custom implementation (like above) for full control
```

## Common Use Cases

### 1. Authentication Middleware
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Async middleware to verify JWT tokens
const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Async operation: verify token
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET!, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      });
    });

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Usage
app.use('/api/habits', authenticateToken, habitRoutes);
```

### 2. Database Connection Middleware
```typescript
import { Request, Response, NextFunction } from 'express';
import { pool } from './db';

// Attach database connection to request
const attachDb = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const connection = await pool.getConnection();

    // Attach to request object
    req.db = connection;

    // Release connection after response is sent
    res.on('finish', () => {
      connection.release();
    });

    next();
  } catch (error) {
    next(error);
  }
};

app.use('/api', attachDb);
```

### 3. Rate Limiting Middleware
```typescript
import { Request, Response, NextFunction } from 'express';
import { redisClient } from './redis';

const rateLimit = (maxRequests: number, windowMs: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip;
      const key = `rate_limit:${ip}`;

      // Async operation: get current count from Redis
      const current = await redisClient.get(key);

      if (current && parseInt(current) >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests, please try again later'
        });
      }

      // Increment counter
      const multi = redisClient.multi();
      multi.incr(key);
      if (!current) {
        multi.expire(key, Math.ceil(windowMs / 1000));
      }
      await multi.exec();

      next();
    } catch (error) {
      // If Redis fails, you might want to allow the request through
      console.error('Rate limit check failed:', error);
      next();
    }
  };
};

// Usage: 100 requests per 15 minutes
app.use('/api', rateLimit(100, 15 * 60 * 1000));
```

### 4. Request Validation with External Service
```typescript
import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

// Validate API key against external service
const validateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Async operation: validate with external service
    const response = await axios.post('https://api-validator.com/validate', {
      key: apiKey
    });

    if (!response.data.valid) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    req.apiKeyData = response.data;
    next();
  } catch (error) {
    next(error);
  }
};
```

### 5. Logging with Async Operations
```typescript
import { Request, Response, NextFunction } from 'express';
import { logToDatabase } from './logger';

const asyncLogger = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  // Capture response
  res.on('finish', async () => {
    const duration = Date.now() - start;

    try {
      // Async operation: log to database (don't block the response)
      await logToDatabase({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log request:', error);
    }
  });

  next();
};
```

## Error Handling in Async Middlewares

### Creating an Async Handler Wrapper
```typescript
import { Request, Response, NextFunction } from 'express';

// Generic async handler wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Usage
app.use('/api/users', asyncHandler(async (req, res, next) => {
  const users = await getUsersFromDatabase();
  req.users = users;
  next();
}));
```

### Global Error Handler for Async Errors
```typescript
import { Request, Response, NextFunction } from 'express';

// This should be placed AFTER all routes
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Default error
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});
```

## Best Practices

### 1. Always Handle Errors
```typescript
// ❌ Bad: Unhandled promise rejection
app.use(async (req, res, next) => {
  const data = await fetchData(); // If this fails, Express won't catch it
  req.data = data;
  next();
});

// ✅ Good: Proper error handling
app.use(async (req, res, next) => {
  try {
    const data = await fetchData();
    req.data = data;
    next();
  } catch (error) {
    next(error);
  }
});
```

### 2. Don't Mix Callbacks and Promises
```typescript
// ❌ Bad: Mixing callbacks and async/await
app.use(async (req, res, next) => {
  db.query('SELECT *', (err, results) => { // Callback-based
    if (err) return next(err);
    req.results = results;
    next();
  });
});

// ✅ Good: Use promises consistently
app.use(async (req, res, next) => {
  try {
    const results = await db.query('SELECT *'); // Promise-based
    req.results = results;
    next();
  } catch (error) {
    next(error);
  }
});
```

### 3. Call next() Only Once
```typescript
// ❌ Bad: Multiple next() calls possible
app.use(async (req, res, next) => {
  try {
    const user = await getUser(req.userId);
    next();

    if (user.role === 'admin') {
      next(); // Error: next() called twice!
    }
  } catch (error) {
    next(error);
  }
});

// ✅ Good: Single execution path
app.use(async (req, res, next) => {
  try {
    const user = await getUser(req.userId);
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
});
```

### 4. Use TypeScript for Type Safety
```typescript
import { Request, Response, NextFunction } from 'express';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await authenticate(req);
    req.user = user; // TypeScript knows about req.user
    next();
  } catch (error) {
    next(error);
  }
};
```

## Practical Examples

### Complete Authentication Flow
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserById } from './models/user';

// Utility wrapper for async middlewares
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Authentication middleware
export const authenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  }
);

// Authorization middleware (must come after authenticate)
export const authorize = (...roles: string[]) => {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    }
  );
};

// Usage in routes
app.use('/api/habits', authenticate, habitRoutes);
app.delete('/api/users/:id', authenticate, authorize('admin'), deleteUser);
```

### Caching Middleware
```typescript
import { Request, Response, NextFunction } from 'express';
import { redisClient } from './redis';

const cacheMiddleware = (duration: number) => {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        return next();
      }

      const key = `cache:${req.originalUrl}`;

      try {
        const cachedResponse = await redisClient.get(key);

        if (cachedResponse) {
          return res.json(JSON.parse(cachedResponse));
        }

        // Store original send method
        const originalSend = res.json.bind(res);

        // Override send to cache the response
        res.json = function(data: any) {
          redisClient.setex(key, duration, JSON.stringify(data))
            .catch(err => console.error('Cache set failed:', err));

          return originalSend(data);
        };

        next();
      } catch (error) {
        // If cache fails, continue without caching
        console.error('Cache middleware error:', error);
        next();
      }
    }
  );
};

// Usage: Cache for 5 minutes
app.get('/api/habits', cacheMiddleware(300), getHabits);
```

## Summary

Key takeaways for asynchronous middlewares:

1. **Always use try-catch** or an async handler wrapper
2. **Pass errors to next()** so Express can handle them
3. **Call next() exactly once** per middleware execution
4. **Don't mix callbacks and promises** - stick to async/await
5. **Use TypeScript** for better type safety and developer experience
6. **Place error handler middleware last** in your middleware chain
7. **Be mindful of performance** - async operations add latency

By following these patterns, your Express.js application will be more robust, maintainable, and easier to debug when dealing with asynchronous operations.
