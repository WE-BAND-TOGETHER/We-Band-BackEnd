import { Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/authRequest';

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

  return blocks.slice(0, 30);
};

/**
 * blocks[30] → BINARY(4)
 */
const blocksToBinary = (blocks: number[]): Buffer => {
  const buffer = Buffer.alloc(4, 0);

  for (let i = 0; i < 30; i++) {
    if (blocks[i] === 1) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      buffer[byteIndex] |= 1 << bitIndex;
    }
  }

  return buffer;
};

/**
 * 📅 개인 주간 일정 조회
 * GET /calendar/week?day=YYYY-MM-DD
 */
export const getWeeklyCalendar = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({
        message: '인증에 실패했습니다. 다시 로그인해주세요.',
      });
    }

    const day = req.query.day as string;
    if (!day) {
      return res.status(400).json({ message: 'day 파라미터가 필요합니다.' });
    }

    const baseDate = new Date(day);
    if (isNaN(baseDate.getTime())) {
      return res.status(400).json({ message: 'day 형식이 올바르지 않습니다.' });
    }

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

/**
 * 💾 개인 주간 일정 저장
 * POST /calendar/week?day=YYYY-MM-DD
 */
export const saveWeeklyCalendar = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({
        message: '주간 일정 저장 요청 형식이 올바르지 않습니다.',
      });
    }

    const day = req.query.day as string;
    const { days } = req.body;

    if (!day || !Array.isArray(days) || days.length !== 7) {
      return res.status(400).json({
        message: '주간 일정 저장 요청 형식이 올바르지 않습니다.',
      });
    }

    const baseDate = new Date(day);
    if (isNaN(baseDate.getTime())) {
      return res.status(400).json({
        message: '주간 일정 저장 요청 형식이 올바르지 않습니다.',
      });
    }

    const startDate = new Date(baseDate);
    startDate.setDate(baseDate.getDate() - baseDate.getDay());

    const operations = [];

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(startDate);
      targetDate.setDate(startDate.getDate() + i);
      const dateStr = targetDate.toISOString().split('T')[0];

      const dayData = days.find((d: any) => d.date === dateStr);
      if (!dayData || !Array.isArray(dayData.blocks) || dayData.blocks.length !== 30) {
        return res.status(400).json({
          message: '주간 일정 저장 요청 형식이 올바르지 않습니다.',
        });
      }

      const binary = blocksToBinary(dayData.blocks);

      operations.push(
        prisma.schedule.upsert({
          where: {
            date_user_id: {
              date: targetDate,
              user_id: req.user.user_id,
            },
          },
          update: {
            block_data: binary,
          },
          create: {
            date: targetDate,
            user_id: req.user.user_id,
            block_data: binary,
          },
        }),
      );
    }

    await prisma.$transaction(operations);

    return res.status(200).json({
      message: '개인 주간 일정이 성공적으로 저장되었습니다.',
      startDate: startDate.toISOString().split('T')[0],
    });
  } catch (error: any) {
    logger.error('주간 일정 저장 실패: ' + error.message);
    return res.status(500).json({
      message: '주간 일정 저장 중 오류가 발생했습니다.',
    });
  }
};
