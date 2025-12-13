import express from 'express';
import { authMiddleware } from '../middlewares/authMiddlewares';
import { getWeeklyCalendar } from '../controllers/calendarControllers';

const router = express.Router();

// GET /calendar/week
router.get('/week', authMiddleware, getWeeklyCalendar);

export default router;
