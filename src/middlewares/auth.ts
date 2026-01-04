import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt.ts'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    username: string
  }
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const payload = await verifyToken(token)

    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
    }
    console.log('##Authenticated user:', payload)
    next()
  } catch (error) {
    console.error(error)
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

// export const authenticateAsync = asy
