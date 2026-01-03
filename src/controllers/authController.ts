import type { Request, Response } from 'express'
import { db } from '../db/connection.ts'
import { users, type NewUser } from '../db/schema.ts'
import { generateToken } from '../utils/jwt.ts'
import { comparePassword, hashPassword } from '../utils/passwords.ts'
import { eq } from 'drizzle-orm'

export const register = async (
  req: Request<unknown, NewUser, NewUser>,
  res: Response
) => {
  try {
    const { username, email, password, firstName, lastName } = req.body
    const hashedPassword = await hashPassword(password)
    const [user] = await db
      .insert(users)
      .values({
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName,
      })
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      })

    const token = await generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
    })
    res.status(201).json({ token, message: 'User created successfully', user })
  } catch (error) {
    console.error('Registration error: ', error)
    res.status(500).json({ message: 'Failed to create user' })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const isPasswordValid = await comparePassword(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const token = await generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
    })

    res.status(200).json({
      token,
      message: 'Login successful',
      user: {
        email: user.email,
        username: user.username,
      },
    })
  } catch (error) {
    console.error('Login error: ', error)
    res.status(500).json({ message: 'Failed to login' })
  }
}
