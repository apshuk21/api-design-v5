import { Router } from 'express'
import { z } from 'zod'
import {
  validateRequestBody,
  validateRequestParams,
} from '../middlewares/index.ts'
import { authenticate } from '../middlewares/auth.ts'
import {
  createHabit,
  getUserHabits,
  updateHabit,
} from '../controllers/habitController.ts'

const habitSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  targetCount: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  tagIds: z.array(z.string()).optional().default([]),
})

const habitParamsSchema = z.object({
  id: z.string().max(3),
})

const router = Router()

router.use(authenticate)

router.get('/', getUserHabits)

router.get('/:id', (req, res) => {
  res.json({ message: `Get one habit with id: ${req.params.id}` })
})

router.post('/', validateRequestBody(habitSchema), createHabit)

router.delete('/:id', (req, res) => {
  res.json({ message: `Habit deleted with id: ${req.params.id}` })
})

router.put(
  '/:id/complete',
  [validateRequestParams(habitParamsSchema), validateRequestBody(habitSchema)],
  updateHabit
)

export default router
