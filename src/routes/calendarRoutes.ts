import express from 'express';
import { authMiddleware } from '../middlewares/authMiddlewares';
import { getWeeklyCalendar } from '../controllers/calendarControllers';
import { saveWeeklyCalendar } from '../controllers/calendarControllers';

const router = express.Router();

// GET /calendar/week
router.get('/week', authMiddleware, getWeeklyCalendar);

// POST /calendar/week
router.post('/week', authMiddleware, saveWeeklyCalendar);

export default router;
