import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import authRoutes from './routes/authRoutes.ts'
import habitRoutes from './routes/habitRoutes.ts'
import userRoutes from './routes/userRoutes.ts'
import { isTest } from '../env.ts'
import { APIError, errorHandler } from './middlewares/errorHandler.ts'

const app = express()

app.use(helmet())
app.use(cors())
app.use(
  morgan('dev', {
    skip: () => isTest(),
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// app.use((_req, _res, next) => {
//   next(new APIError('Validation Error', 400, 'ValidationError'))
// })

app.get('/health', (req, res) => {
  res.json({ message: 'hello' }).status(200)
})

app.use('/api/auth', authRoutes)

app.use('/api/habits', habitRoutes)

app.use('/api/users', userRoutes)

app.use(errorHandler)

export { app }
