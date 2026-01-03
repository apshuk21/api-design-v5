# Express Request and Response Generics

## Overview

Express provides TypeScript generics for `Request` and `Response` objects to enable type-safe route handlers. This document explains the different generic parameters available.

## Request Generics

The Express `Request` type accepts up to 4 generic type parameters:

```typescript
Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>
```

### Generic Parameters

#### 1. `P` - Route Parameters (Params)
- **Type**: Object containing route parameter names and their types
- **Default**: `ParamsDictionary` (which is `Record<string, string>`)
- **Usage**: Defines the shape of `req.params`
- **Example**:
  ```typescript
  interface UserParams {
    userId: string
  }

  // Route: /users/:userId
  req: Request<UserParams>
  // req.params.userId is typed as string
  ```

#### 2. `ResBody` - Response Body
- **Type**: The expected response body type
- **Default**: `any`
- **Usage**: Defines what the response will send back (used for documentation/typing)
- **Example**:
  ```typescript
  interface UserResponse {
    id: number
    username: string
  }

  req: Request<unknown, UserResponse>
  // Indicates the response will be of type UserResponse
  ```

#### 3. `ReqBody` - Request Body
- **Type**: The expected request body type
- **Default**: `any`
- **Usage**: Defines the shape of `req.body`
- **Example**:
  ```typescript
  interface LoginBody {
    email: string
    password: string
  }

  req: Request<unknown, unknown, LoginBody>
  // req.body is typed as LoginBody
  ```

#### 4. `ReqQuery` - Query Parameters
- **Type**: Object containing query parameter names and their types
- **Default**: `Query` (which is `ParsedQs`)
- **Usage**: Defines the shape of `req.query`
- **Example**:
  ```typescript
  interface SearchQuery {
    term: string
    page?: string
  }

  req: Request<unknown, unknown, unknown, SearchQuery>
  // req.query.term is typed as string
  ```

#### 5. `LocalsObj` - Response Locals
- **Type**: Object containing local variables scoped to the request
- **Default**: `Record<string, any>`
- **Usage**: Defines the shape of `res.locals` (data passed between middleware)
- **Example**:
  ```typescript
  interface AuthLocals {
    userId: number
    role: string
  }

  req: Request<unknown, unknown, unknown, unknown, AuthLocals>
  // res.locals.userId and res.locals.role are typed
  ```

### Example from the Codebase

In [authController.ts:9](../src/controllers/authController.ts#L9):

```typescript
export const register = async (
  req: Request<unknown, NewUser, NewUser>,
  res: Response
) => {
  // ...
}
```

This means:
- **Route Parameters**: `unknown` (no route params expected)
- **Response Body**: `NewUser` (will respond with a NewUser object)
- **Request Body**: `NewUser` (expects a NewUser object in the request body)
- **Query Parameters**: Default (not specified)
- **Locals**: Default (not specified)

## Response Generics

The Express `Response` type accepts up to 3 generic type parameters:

```typescript
Response<ResBody, LocalsObj, StatusCode>
```

### Generic Parameters

#### 1. `ResBody` - Response Body
- **Type**: The type of data being sent in the response
- **Default**: `any`
- **Usage**: Ensures type safety for `res.json()`, `res.send()`, etc.
- **Example**:
  ```typescript
  interface UserResponse {
    id: number
    username: string
  }

  res: Response<UserResponse>
  // res.json() expects UserResponse type
  ```

#### 2. `LocalsObj` - Response Locals
- **Type**: Object containing local variables
- **Default**: `Record<string, any>`
- **Usage**: Same as Request's LocalsObj parameter
- **Example**:
  ```typescript
  interface AuthLocals {
    userId: number
  }

  res: Response<unknown, AuthLocals>
  // res.locals.userId is typed as number
  ```

#### 3. `StatusCode` - HTTP Status Code
- **Type**: Number literal type for the status code
- **Default**: `number`
- **Usage**: Restricts status codes to specific values
- **Example**:
  ```typescript
  res: Response<UserResponse, {}, 200 | 201>
  // Only allows res.status(200) or res.status(201)
  ```

## Best Practices

1. **Use `unknown` for unused generics**: Instead of leaving them as `any`, use `unknown` to be more explicit
2. **Define interfaces for complex types**: Create separate interfaces for request/response bodies
3. **Match Request and Response types**: Ensure the response body type in Request matches the one in Response
4. **Type middleware locals**: Define a consistent `LocalsObj` type for authentication/authorization data
5. **Skip defaults**: You don't need to specify all parameters if you're using defaults

## Common Patterns

### Authentication Route
```typescript
interface LoginBody {
  email: string
  password: string
}

interface AuthResponse {
  token: string
  user: User
}

async (
  req: Request<unknown, AuthResponse, LoginBody>,
  res: Response<AuthResponse>
) => {
  // Fully typed request body and response
}
```

### RESTful Resource Route
```typescript
interface UserParams {
  userId: string
}

interface UserResponse {
  id: number
  username: string
}

async (
  req: Request<UserParams, UserResponse>,
  res: Response<UserResponse>
) => {
  // req.params.userId and response are typed
}
```

### Query Parameters
```typescript
interface ListQuery {
  page?: string
  limit?: string
  sort?: 'asc' | 'desc'
}

interface ListResponse<T> {
  data: T[]
  total: number
  page: number
}

async (
  req: Request<unknown, ListResponse<User>, unknown, ListQuery>,
  res: Response<ListResponse<User>>
) => {
  // Query params are typed
}
```
