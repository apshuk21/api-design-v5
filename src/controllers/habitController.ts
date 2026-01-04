import type { Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth.ts'
import { db } from '../db/connection.ts'
import { habits, entries, habitTags, tags } from '../db/schema.ts'
import { and, eq, desc, inArray } from 'drizzle-orm'

export async function getHabits(req: AuthenticatedRequest, res: Response) {}

export async function createHabit(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, description, frequency, targetCount, tagIds, isActive } =
      req.body

    const result = await db.transaction(async (tx) => {
      const [habit] = await tx
        .insert(habits)
        .values({
          name,
          ...(description !== undefined && { description }),
          frequency,
          ...(targetCount !== undefined && { targetCount }),
          ...(isActive !== undefined && { isActive }),
          userId: req.user!.id,
        })
        .returning()
      if (tagIds && tagIds.length > 0) {
        await tx.insert(habitTags).values(
          tagIds.map((tagId: string) => ({
            habitId: habit.id,
            tagId,
          }))
        )
      }
      return habit
    })
    res.status(201).json({
      message: 'Habit created successfully',
      habit: result,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const getUserHabits = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user!.id

    const userHabitsWithTags = await db.query.habits.findMany({
      where: eq(habits.userId, userId),
      with: {
        tags: {
          with: {
            tag: true,
          },
        },
      },
      orderBy: [desc(habits.createdAt)],
    })

    const habitsWithTags = userHabitsWithTags.map((habit) => ({
      ...habit,
      tags: habit.tags.map((habitTag) => habitTag.tag),
    }))

    res.status(200).json({
      message: 'Habits retrieved successfully',
      habits: habitsWithTags,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const updateHabit = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const habitId = req.params.id
    const { name, description, frequency, targetCount, tagIds, isActive } =
      req.body

    const habit = await db.query.habits.findFirst({
      where: and(eq(habits.id, habitId), eq(habits.userId, userId)),
    })

    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' })
    }

    const updatedHabit = await db.transaction(async (tx) => {
      const [updatedHabit] = await tx
        .update(habits)
        .set({
          name,
          ...(description !== undefined && { description }),
          frequency,
          ...(targetCount !== undefined && { targetCount }),
          ...(isActive !== undefined && { isActive }),
          updatedAt: new Date(),
        })
        .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
        .returning()

      if (tagIds !== undefined) {
        await tx.delete(habitTags).where(eq(habitTags.habitId, habitId))

        if (tagIds.length > 0) {
          await tx.insert(habitTags).values(
            tagIds.map((tagId: string) => ({
              habitId,
              tagId,
            }))
          )
        }
      }

      return updatedHabit
    })

    res.status(200).json({
      message: 'Habit updated successfully',
      habit: updatedHabit,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}
