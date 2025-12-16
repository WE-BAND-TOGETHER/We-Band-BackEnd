import { Router } from 'express';
import { kakaoLogin, redirectToKakaoLogin, logout, withdraw } from '../controllers/authControllers';

const router = Router();

router.get('/kakao', redirectToKakaoLogin);
router.post('/kakao-login', kakaoLogin);

router.post('/logout', logout);
router.delete('/withdraw', withdraw);

export default router;
