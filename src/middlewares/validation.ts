import type { Request, Response, NextFunction } from 'express'
import { z, ZodError } from 'zod'

export const validateRequestBody = (schema: z.ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body)

      // This step is important in case of a modified or coerced body params as per the schema.
      req.body = validatedData

      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue: any) => ({
          message: issue.message,
          code: issue.code,
          field: issue.path.join('.'),
        }))

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errorMessages,
        })
      } else {
        next(err)
      }
    }
  }
}

export const validateRequestParams = (schema: z.ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue: any) => ({
          message: issue.message,
          code: issue.code,
          field: issue.path.join('.'),
        }))

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errorMessages,
        })
      } else {
        next(err)
      }
    }
  }
}

export const validateRequestQueryParams = (schema: z.ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.query)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue: any) => ({
          message: issue.message,
          code: issue.code,
          field: issue.path.join('.'),
        }))

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errorMessages,
        })
      } else {
        next(err)
      }
    }
  }
}
