import { Router } from 'express'
import { login, register } from '../controllers/authController.ts'
import { validateRequestBody } from '../middlewares/validation.ts'
import { insertUserSchema } from '../db/schema.ts'
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const router = Router()

router.post('/register', validateRequestBody(insertUserSchema), register)

router.post('/login', validateRequestBody(loginSchema), login)

export default router
