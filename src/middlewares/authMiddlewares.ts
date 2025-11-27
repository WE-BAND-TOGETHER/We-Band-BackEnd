import jwt from 'jsonwebtoken';
import { PrismaClient } from '../generated/prisma';
import { refreshAccessToken } from '../services/jwtServices';
import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient();

// 사용자 인증 미들웨어 (JWT 토큰)
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    logger.error('Access Token이 필요합니다.');
    return res.status(401).json({ message: 'Access Token이 필요합니다.' });
  }

  try {
    // Access Token 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
    };

    // 데이터베이스에서 사용자 확인
    const user = await prisma.weBandUser.findUnique({
      where: { user_id: decoded.userId },
    });

    if (!user) {
      logger.error('사용자를 찾을 수 없습니다.');
      return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // req.user 세팅
    req.user = {
      user_id: user.user_id,
      kakao_id: user.kakao_id.toString(),
      email: user.email,
      user_name: user.user_name,
      profile_img: user.profile_img,
    };

    return next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      // Access Token 만료 → Refresh Token으로 재발급
      try {
        const newAccessToken = await refreshAccessToken(req);

        req.headers.authorization = `Bearer ${newAccessToken}`;

        const decoded = jwt.verify(newAccessToken, process.env.JWT_SECRET!) as {
          userId: number;
        };

        const user = await prisma.weBandUser.findUnique({
          where: { user_id: decoded.userId },
        });

        if (!user) {
          logger.error('사용자를 찾을 수 없습니다.');
          return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        req.user = {
          user_id: user.user_id,
          kakao_id: user.kakao_id.toString(),
          email: user.email,
          user_name: user.user_name,
          profile_img: user.profile_img,
        };

        // 새 Access Token을 응답 헤더로 전달
        res.setHeader('x-access-token', newAccessToken);
        logger.info(`새 Access Token 발급: ${user.email}`);

        return next();
      } catch (refreshErr: any) {
        logger.error('새로운 Access Token 발급 실패: ' + refreshErr.message);
        return res.status(401).json({ message: '새로운 Access Token 발급 실패' });
      }
    }

    logger.error('유효하지 않은 Access Token입니다.');
    return res.status(401).json({ message: '유효하지 않은 Access Token입니다.' });
  }
};
