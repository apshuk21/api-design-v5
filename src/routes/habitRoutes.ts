import { Router } from 'express'
import { z } from 'zod'
import {
  validateRequestBody,
  validateRequestParams,
} from '../middlewares/index.ts'

const habitSchema = z.object({
  name: z.string().min(3).max(100),
  age: z.coerce.number().positive().min(18).max(100),
  // description: z.string().min(3).max(100),
  // frequency: z.string().min(3).max(100),
  // startDate: z.string().datetime(),
  // endDate: z.string().datetime(),
})

const habitParamsSchema = z.object({
  id: z.string().max(3),
})

const router = Router()

router.get('/', (req, res) => {
  res.json({ message: 'All habits' })
})

router.get('/:id', (req, res) => {
  res.json({ message: `Get one habit with id: ${req.params.id}` })
})

router.post('/', validateRequestBody(habitSchema), (req, res) => {
  res.status(201).json({ message: 'Habit created' })
})

router.delete('/:id', (req, res) => {
  res.json({ message: `Habit deleted with id: ${req.params.id}` })
})

router.put(
  '/:id/complete',
  [validateRequestParams(habitParamsSchema), validateRequestBody(habitSchema)],
  (req, res) => {
    res.json({ message: `Habit updated with id: ${req.params.id}` })
  }
)

export default router
