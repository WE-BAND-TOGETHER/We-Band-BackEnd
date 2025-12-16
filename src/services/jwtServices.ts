import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
// 🚨 [핵심 수정]: Prisma Client 생성 경로를 '../generated/prisma'로 변경
// (src/services 폴더에서 src/generated 폴더를 바라보는 상대 경로)
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// ⭐ 1. 환경 변수 로딩 및 타입 안전성 확보
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  logger.error('FATAL: JWT_SECRET 또는 JWT_REFRESH_SECRET 환경 변수가 설정되지 않았습니다.');
  throw new Error(
    'JWT Secret Key 환경 변수가 설정되지 않았습니다. .env 파일 및 ts-node 설정을 확인해주세요.',
  );
}

// ⭐ 2. expiresIn 변수도 string 타입임을 명시적으로 지정 및 TS2322 오류 회피
const ACCESS_EXP: string = process.env.JWT_ACCESS_EXPIRATION ?? '1h';
const REFRESH_EXP: string = process.env.JWT_REFRESH_EXPIRATION ?? '14d';

interface JwtUserType {
  user_id: number;
  email: string;
  kakao_id: bigint;
  user_name: string;
  profile_img: string | null;
}

interface RefreshTokenPayload extends JwtPayload {
  userId: number;
}

const createJwtPayload = (user: JwtUserType) => {
  return {
    userId: user.user_id,
    email: user.email,
    kakaoID: user.kakao_id.toString(),
  };
};

// JWT 액세스 토큰 생성
export const generateAccessToken = (user: JwtUserType): string => {
  const payload = createJwtPayload(user);

  // TS2322 오류 해결: `@ts-ignore`를 사용하여 컴파일러의 엄격한 타입 검사를 회피
  const options: SignOptions = {
    // @ts-ignore
    expiresIn: ACCESS_EXP,
  };

  return jwt.sign(payload, JWT_SECRET, options);
};

// JWT 리프래시 토큰 생성
export const generateRefreshToken = (user: JwtUserType): string => {
  const payload = createJwtPayload(user);

  // TS2322 오류 해결: `@ts-ignore`를 사용하여 컴파일러의 엄격한 타입 검사를 회피
  const options: SignOptions = {
    // @ts-ignore
    expiresIn: REFRESH_EXP,
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, options);
};

// JWT 액세스 토큰 갱신
export const refreshAccessToken = async (req: any): Promise<string> => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new Error('Refresh Token이 필요합니다.');
    }

    const secret = JWT_REFRESH_SECRET;

    const decoded = jwt.verify(refreshToken, secret) as RefreshTokenPayload;

    const user = await prisma.weBandUser.findUnique({
      where: { user_id: decoded.userId },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    const newAccessToken = generateAccessToken(user as JwtUserType);

    logger.info(`Refresh Token 검증 성공 - 새로운 Access Token 발급: ${user.email}`);

    return newAccessToken;
  } catch (err: any) {
    logger.error('Refresh Token 검증 실패: ' + err.message);
    throw new Error('유효하지 않거나 만료된 Refresh Token입니다.');
  }
};
