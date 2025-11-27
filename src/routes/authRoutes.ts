import { Router } from 'express';
import {
  handleKakaoCallback,
  handleKakaoUser,
  kakaoLogin,
  redirectToKakaoLogin,
  logout,
  withdraw,
} from '../controllers/authControllers.js';

const router = Router();

router.get('/kakao', redirectToKakaoLogin);
router.get('/kakao/callback', handleKakaoCallback);
router.post('/kakao-login', kakaoLogin);
router.post('/kakao-login/user', handleKakaoUser);

router.post('/logout', logout);
router.delete('/withdraw', withdraw);

export default router;
