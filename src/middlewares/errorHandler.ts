import type { Request, Response, NextFunction } from 'express'
import { env } from '../../env.ts'

export class APIError extends Error {
  status: number
  name: string
  constructor(message: string, status: number, name: string) {
    super(message)
    this.status = status
    this.name = name

    // Error.captureStackTrace(this, this.constructor)
  }
}

export const errorHandler = (
  err: APIError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err.stack)
  let status = err.status || 500
  let message = err.message || 'Something went wrong!'

  if (err.name === 'ValidationError') {
    status = 400
    message = 'Validation Error'
  } else if (err.name === 'UnauthorizedError') {
    status = 401
    message = 'Unauthorized Error'
  }
  res.status(status).json({
    error: message,
    ...(env.APP_STAGE === 'dev' && { stack: err.stack }),
  })
}
