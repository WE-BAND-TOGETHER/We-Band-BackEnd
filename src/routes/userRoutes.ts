import express from 'express';
import { authMiddleware } from '../middlewares/authMiddlewares';
import { getMyInfo } from '../controllers/userControllers';

const router = express.Router();

// GET /me
router.get('/', authMiddleware, getMyInfo);

export default router;
