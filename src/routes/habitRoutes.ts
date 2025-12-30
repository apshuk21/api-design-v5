import { Router } from 'express'

const router = Router()

router.get('/', (req, res) => {
  res.json({ message: 'All habits' })
})

router.get('/:id', (req, res) => {
  res.json({ message: `Get one habit with id: ${req.params.id}` })
})

router.post('/', (req, res) => {
  res.status(201).json({ message: 'Habit created' })
})

router.delete('/:id', (req, res) => {
  res.json({ message: `Habit deleted with id: ${req.params.id}` })
})

router.put('/:id/complete', (req, res) => {
  res.json({ message: `Habit updated with id: ${req.params.id}` })
})

export default router
