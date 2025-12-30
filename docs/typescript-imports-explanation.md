# Why .ts Extensions Work with module: "nodenext"

## The Question

With `module: "nodenext"` in tsconfig.json, the standard advice is to use `.js` extensions in import statements (because TypeScript follows Node.js ESM resolution rules). However, in this project, `.ts` extensions are working fine. Why?

## The Answer

The `.ts` extensions work because of **three specific TypeScript compiler options** working together:

### 1. `allowImportingTsExtensions: true`

This option allows you to write `.ts` extensions in import statements:

```typescript
import { app } from './server.ts'  // ✅ Allowed
```

Without this option, TypeScript would error on `.ts` extensions, requiring you to use `.js` instead.

### 2. `rewriteRelativeImportExtensions: true`

This option tells TypeScript to **automatically rewrite** `.ts` extensions to `.js` extensions during type checking and emission. For example:

```typescript
// What you write:
import { app } from './server.ts'

// What gets resolved at runtime:
import { app } from './server.js'
```

This is crucial for runtime compatibility since Node.js doesn't understand `.ts` files natively.

### 3. `noEmit: true`

This option tells TypeScript **not to emit any JavaScript files**. Instead, your code runs directly using a TypeScript runtime like:

- **tsx** (modern TypeScript runner)
- **ts-node** (traditional TypeScript runner)
- **Node.js with --experimental-strip-types** (Node 20.6+)

Looking at [package.json:8-9](package.json#L8-L9), the scripts use:
```json
"dev": "node --watch src/index.ts",
"start": "node src/index.ts"
```

This runs TypeScript files directly, so the actual `.ts` files are being executed, not transpiled `.js` files.

## How It All Works Together

```
┌─────────────────────────────────────────────────┐
│ You write: import { app } from './server.ts'    │
└─────────────────────┬───────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────┐
│ allowImportingTsExtensions: true                │
│ ✅ TypeScript accepts .ts in import             │
└─────────────────────┬───────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────┐
│ rewriteRelativeImportExtensions: true           │
│ 🔄 Internally resolves as './server.js'         │
└─────────────────────┬───────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────┐
│ noEmit: true                                    │
│ 🚫 No .js files generated                       │
│ ⚡ tsx/ts-node executes .ts directly            │
└─────────────────────────────────────────────────┘
```

## Why the Advice to Use .js Extensions?

When you're **transpiling TypeScript to JavaScript** (i.e., `noEmit: false`), you must write `.js` extensions in your imports because:

1. TypeScript removes type information but **keeps import paths as-is**
2. Node.js ESM requires exact extensions (`.js`, not `.ts`)
3. Your `.ts` source imports must match what will exist after compilation

For example, with transpilation:

```typescript
// src/index.ts (source)
import { app } from './server.js'  // Must use .js

// After tsc compiles:
// dist/index.js
import { app } from './server.js'  // .js file exists here
```

## Current Project Setup

This project uses a **direct execution** approach:

- `noEmit: true` - No transpilation
- TypeScript runtime (tsx/ts-node or Node's experimental flag)
- `.ts` extensions in imports work because files are never transpiled
- `rewriteRelativeImportExtensions` handles module resolution internally

## Summary

| Setup | Import Extension | Reason |
|-------|------------------|--------|
| **Transpiling** (`noEmit: false`) | `.js` | Imports must match emitted files |
| **Direct execution** (`noEmit: true` + tsx/ts-node) | `.ts` | Can use `.ts` with special compiler flags |

Your project uses the second approach, which is why `.ts` extensions work perfectly fine!

## References

- [tsconfig.json:6](tsconfig.json#L6) - `rewriteRelativeImportExtensions: true`
- [tsconfig.json:9](tsconfig.json#L9) - `allowImportingTsExtensions: true`
- [tsconfig.json:3](tsconfig.json#L3) - `noEmit: true`
- [package.json:36](package.json#L36) - `ts-node` dependency
