import { Router } from 'express'

const router = Router()

router.get('/', (req, res) => {
  res.json({ message: 'All users' })
})

router.get('/:id', (req, res) => {
  res.json({ message: `Get one user with id: ${req.params.id}` })
})

router.post('/', (req, res) => {
  res.status(201).json({ message: 'User created' })
})

router.delete('/:id', (req, res) => {
  res.json({ message: `User deleted with id: ${req.params.id}` })
})

router.put('/:id', (req, res) => {
  res.json({ message: `User updated with id: ${req.params.id}` })
})

export default router
