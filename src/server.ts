import express from 'express'
import authRoutes from './routes/authRoutes.ts'
import habitRoutes from './routes/habitRoutes.ts'
import userRoutes from './routes/userRoutes.ts'

const app = express()

app.get('/health', (req, res) => {
  res.json({ message: 'hello' }).status(200)
})

app.use('/api/auth', authRoutes)

app.use('/api/habits', habitRoutes)

app.use('/api/users', userRoutes)

export { app }
