import { Request, Response } from 'express';
import { PrismaClient } from '../generated/prisma';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * BINARY(4) → blocks[30]
 */
const binaryToBlocks = (buffer: Buffer): number[] => {
  const blocks: number[] = [];

  for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
    for (let bit = 7; bit >= 0; bit--) {
      blocks.push((buffer[byteIndex] >> bit) & 1);
    }
  }

  // 앞 30개만 사용
  return blocks.slice(0, 30);
};

/**
 * 기준 날짜 포함 주간 일정 조회
 */
export const getWeeklyCalendar = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({
        message: '인증에 실패했습니다. 다시 로그인해주세요.',
      });
    }

    const day = req.query.day as string;
    if (!day) {
      return res.status(400).json({
        message: 'day 파라미터가 필요합니다.',
      });
    }

    const baseDate = new Date(day);
    if (isNaN(baseDate.getTime())) {
      return res.status(400).json({
        message: 'day 형식이 올바르지 않습니다.',
      });
    }

    // 기준 날짜를 포함한 주의 시작 날짜
    const startDate = new Date(baseDate);
    startDate.setDate(baseDate.getDate() - baseDate.getDay());

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const schedules = await prisma.schedule.findMany({
      where: {
        user_id: req.user.user_id,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // date → schedule 매핑
    const scheduleMap = new Map(schedules.map((s) => [s.date.toISOString().split('T')[0], s]));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);

      const dateStr = current.toISOString().split('T')[0];
      const schedule = scheduleMap.get(dateStr);

      days.push({
        date: dateStr,
        blocks: schedule ? binaryToBlocks(schedule.block_data as Buffer) : new Array(30).fill(0),
      });
    }

    return res.status(200).json({
      startDate: startDate.toISOString().split('T')[0],
      days,
    });
  } catch (error: any) {
    logger.error('주간 일정 조회 실패: ' + error.message);
    return res.status(500).json({
      message: '주간 일정 조회 중 오류가 발생했습니다.',
    });
  }
};
