import { prisma } from '../prisma';
import axios from 'axios';
import { logger } from '../utils/logger';
import { Request, Response } from 'express';
import { AuthRequest } from '../types/authRequest';
import { generateAccessToken, generateRefreshToken } from '../services/jwtServices';
import qs from 'qs';

// 카카오 로그인 페이지로 리디렉션
export const redirectToKakaoLogin = (req: Request, res: Response) => {
  const redirectUri = process.env.REDIRECT_URI!;
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${process.env.REST_API_KEY}&redirect_uri=${redirectUri}`;

  res.redirect(kakaoAuthUrl);
};

// 🔥 카카오 로그인 (인가코드 → DB → JWT)
// 🔥 카카오 로그인 (인가코드 → DB → JWT)
export const kakaoLogin = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: '인가 코드가 필요합니다.' });
    }

    const redirectUri = process.env.REDIRECT_URI!;

    // 1️⃣ 카카오 Access Token 요청
    const tokenRes = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.REST_API_KEY,
        redirect_uri: redirectUri,
        code,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
      },
    );

    const kakaoAccessToken = tokenRes.data.access_token;

    // 2️⃣ 카카오 유저 정보 조회
    const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${kakaoAccessToken}`,
      },
    });

    const { id: kakaoId, kakao_account, properties } = userRes.data;

    const email = kakao_account?.email;
    if (!email) {
      return res.status(400).json({
        message: '카카오 이메일 제공 동의가 필요합니다.',
      });
    }

    const userName = properties?.nickname ?? email.split('@')[0];
    const profile_img = properties?.profile_image ?? null;

    // 3️⃣ DB upsert
    const user = await prisma.weBandUser.upsert({
      where: { email },
      update: {
        kakao_id: BigInt(kakaoId),
        user_name: userName,
        profile_img,
      },
      create: {
        kakao_id: BigInt(kakaoId),
        email,
        user_name: userName,
        profile_img,
      },
    });

    logger.info(`카카오 로그인 성공: ${email}`);

    // 4️⃣ JWT 발급
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // 5️⃣ Refresh Token 쿠키 저장
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // ⚠️ HTTPS 환경
      sameSite: 'none',
    });

    // 6️⃣ 응답 (🔥 프론트 요구사항 충족)
    return res.status(200).json({
      accessToken,
      refreshToken,
    });
  } catch (error: any) {
    logger.error(
      '카카오 로그인 실패',
      JSON.stringify(error.response?.data || error.message, null, 2),
    );
    return res.status(500).json({ message: '카카오 로그인 실패' });
  }
};

// 로그아웃
export const logout = async (req: AuthRequest, res: Response) => {
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

    logger.info(`로그아웃 완료: ${req.user.email}`);
    return res.status(200).json({ message: '로그아웃 성공' });
  } catch (error: any) {
    logger.error('로그아웃 실패:', error.message);
    return res.status(500).json({ message: '로그아웃 실패' });
  }
};

// 회원 탈퇴
export const withdraw = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '로그인 상태가 아닙니다.' });
    }

    const userId = req.user.user_id;

    await prisma.weBandUser.delete({
      where: { user_id: userId },
    });

    logger.info(`회원 탈퇴 완료: ${userId}`);
    return res.status(200).json({ message: '회원 탈퇴 성공' });
  } catch (error: any) {
    logger.error('회원 탈퇴 실패:', error.message);
    return res.status(500).json({ message: '회원 탈퇴 실패' });
  }
};
