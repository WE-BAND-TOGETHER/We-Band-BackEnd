import { prisma } from '../prisma';
import axios from 'axios';
import { logger } from '../utils/logger';
import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken } from '../services/jwtServices';

// 카카오 로그인 페이지로 리디렉션
export const redirectToKakaoLogin = (req: Request, res: Response) => {
  const redirectUri = process.env.REDIRECT_URI!;
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${process.env.REST_API_KEY}&redirect_uri=${redirectUri}`;
  res.redirect(kakaoAuthUrl);
};

// 콜백 (테스트용)
export const handleKakaoCallback = (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Authorization code not provided');
  res.json({ authorization_code: code });
};

// 카카오 로그인 - 인가코드 → 액세스토큰
export const kakaoLogin = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const redirectUri = process.env.REDIRECT_URI!;

    const response = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      {},
      {
        params: {
          grant_type: 'authorization_code',
          client_id: process.env.REST_API_KEY,
          redirect_uri: redirectUri,
          code: code,
        },
      },
    );

    res.json(response.data);
  } catch (error: any) {
    logger.error('카카오 액세스 토큰 요청 실패: ' + JSON.stringify(error.response?.data));
    res.status(500).send('Token request failed');
  }
};

// 사용자 정보 가져오기
export const getKakaoUser = async (accessToken: string) => {
  const response = await axios.get('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
};

// DB 저장 + JWT 발급
export const handleKakaoUser = async (req: Request, res: Response) => {
  try {
    const { kakaoAccessToken } = req.body;

    const userInfo = await getKakaoUser(kakaoAccessToken);
    const { id: kakaoId, kakao_account, properties } = userInfo;

    const email = kakao_account.email;
    const userName = properties.nickname || email.split('@')[0];
    const profile_img = properties.profile_image || null;

    let user = await prisma.weBandUser.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.weBandUser.create({
        data: {
          kakao_id: BigInt(kakaoId),
          email,
          user_name: userName,
          profile_img,
        },
      });
      logger.info(`새 유저 생성: ${email}`);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    res.json({ user, accessToken });
  } catch (error: any) {
    logger.error('사용자 처리 실패: ' + error.message);
    res.status(500).send('Failed to process user');
  }
};
