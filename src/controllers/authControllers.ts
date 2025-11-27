import { PrismaClient } from '../generated/prisma';
import { generateAccessToken, generateRefreshToken } from '../services/jwtServices.js';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import { Request, Response } from 'express';

const prisma = new PrismaClient();

// 카카오 로그인 페이지로 리디렉션
export const redirectToKakaoLogin = (req: Request, res: Response) => {
  const redirectUri = process.env.REDIRECT_URI!;
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${process.env.REST_API_KEY}&redirect_uri=${redirectUri}`;

  res.redirect(kakaoAuthUrl);
};

// 콜백 (테스트용)
export const handleKakaoCallback = (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }
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

    const { token_type, access_token, expires_in, refresh_token, refresh_token_expires_in, scope } =
      response.data;

    res.json({
      token_type,
      access_token,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
      scope,
    });
  } catch (error: any) {
    logger.error('카카오 액세스 토큰 요청 실패: ' + (error.response?.data || error.message));
    res.status(500).send('Token request failed');
  }
};

// 카카오 사용자 정보 가져오기
export const getKakaoUser = async (accessToken: string) => {
  try {
    const response = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return response.data;
  } catch (error: any) {
    logger.error('카카오 사용자 정보 요청 실패:', error.response?.data || error.message);
    throw new Error('Failed to retrieve user info');
  }
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

      logger.info(`새로운 사용자 생성: ${email}`);
    } else {
      logger.info(`기존 사용자 로그인: ${email}`);
    }

    // JWT 발급
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Refresh Token 쿠키 저장
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    res.json({
      user: {
        id: user.user_id,
        kakao_id: user.kakao_id.toString(),
        email: user.email,
        user_name: user.user_name,
        profile_img: user.profile_img,
      },
      accessToken,
    });
  } catch (error: any) {
    logger.error('사용자 처리 실패: ' + error.message);
    res.status(500).send('Failed to process user');
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '로그인 상태가 아닙니다.' });
    }

    res.cookie('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'dev',
      sameSite: 'none',
      expires: new Date(0),
    });

    logger.debug('로그아웃 되었습니다.');
    res.status(200).json({ message: '로그아웃 성공' });
  } catch (error: any) {
    logger.error('로그아웃 실패: ' + error.message);
    res.status(500).json({ message: '로그아웃 실패' });
  }
};

export const withdraw = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '로그인 상태가 아닙니다.' });
    }

    const userId = req.user.user_id;

    await prisma.weBandUser.delete({
      where: {
        user_id: userId,
      },
    });

    logger.info(`회원 탈퇴 완료: ${userId}`);
    return res.status(200).json({ message: '회원 탈퇴 성공' });
  } catch (error: any) {
    logger.error('회원 탈퇴 실패: ' + error.message);
    res.status(500).json({ message: '회원 탈퇴 실패' });
  }
};
