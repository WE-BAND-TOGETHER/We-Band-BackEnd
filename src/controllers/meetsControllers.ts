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
 * POST /meets
 * 모임 생성: group 생성 + owner를 member에 자동 가입
 * body:
 * {
 *   "groupName": "스터디",
 *   "groupDate": "2025-12-16"   // 없으면 오늘 날짜로 처리
 * }
 */
export const createMeet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const { groupName, groupDate } = req.body as { groupName?: string; groupDate?: string };

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ message: 'groupName 값이 필요합니다.' });
    }

    const date = groupDate ? new Date(groupDate) : new Date();
    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'groupDate 형식이 올바르지 않습니다.' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          group_name: groupName.trim(),
          group_date: date,
          owner_id: req.user!.user_id,
        },
      });

      await tx.member.create({
        data: {
          group_id: group.group_id,
          user_id: req.user!.user_id,
        },
      });

      return group;
    });

    return res.status(201).json({
      message: '모임이 생성되었습니다.',
      meet: {
        groupId: created.group_id,
        groupName: created.group_name,
        groupDate: created.group_date.toISOString().split('T')[0],
        ownerId: created.owner_id,
      },
    });
  } catch (error: any) {
    logger.error('모임 생성 실패: ' + error.message);
    return res.status(500).json({ message: '모임 생성 중 오류가 발생했습니다.' });
  }
};

/**
 * GET /meets
 * 모임 목록
 */
export const getMyMeets = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({
        message: '인증에 실패했습니다. 다시 로그인해주세요.',
      });
    }

    const memberships = await prisma.member.findMany({
      where: { user_id: req.user.user_id },
      select: { group_id: true },
    });

    const groupIds = memberships.map((m) => m.group_id);
    if (groupIds.length === 0) {
      return res.status(200).json({ meets: [] }); // 가입된 모임 없음
    }

    const groups = await prisma.group.findMany({
      where: { group_id: { in: groupIds } },
      orderBy: { group_id: 'desc' },
    });

    // 멤버 수까지
    const counts = await prisma.member.groupBy({
      by: ['group_id'],
      where: { group_id: { in: groupIds } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.group_id, c._count._all]));
    // countMap.get(group_id) = > 멤버 수 출력
    return res.status(200).json({
      meets: groups.map((g) => ({
        groupId: g.group_id,
        groupName: g.group_name,
        groupDate: g.group_date.toISOString().split('T')[0],
        ownerId: g.owner_id,
        memberCount: countMap.get(g.group_id) ?? 0,
      })),
    });
  } catch (error: any) {
    logger.error('내 모임 목록 조회 실패: ' + error.message);
    return res.status(500).json({ message: '내 모임 목록 조회 중 오류가 발생했습니다.' });
  }
};

/**
 * POST /meets/join/:meetId
 * 모임 가입
 * member insert, 중복 방지
 */
export const joinMeet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const meetId = Number(req.params.meetId); //url
    if (!Number.isFinite(meetId)) {
      return res.status(400).json({ message: 'meetId 형식이 올바르지 않습니다.' });
    }

    const group = await prisma.group.findUnique({
      where: { group_id: meetId },
    });

    if (!group) {
      // 모임이 없으면
      return res.status(404).json({ message: '해당 모임을 찾을 수 없습니다.' });
    }

    // 중복 가입 방지: member PK(group_id, user_id)
    try {
      await prisma.member.create({
        data: {
          group_id: meetId,
          user_id: req.user.user_id,
        },
      });
    } catch (e: any) {
      // Prisma unique/PK 충돌은 보통 P2002
      if (e?.code === 'P2002') {
        return res.status(409).json({ message: '이미 가입된 모임입니다.' });
      }
      throw e;
    }

    return res.status(200).json({ message: '모임에 가입되었습니다.' });
  } catch (error: any) {
    logger.error('모임 가입 실패: ' + error.message);
    return res.status(500).json({ message: '모임 가입 중 오류가 발생했습니다.' });
  }
};

/**
 * GET /meets/:meetId
 * meet + members (+ schedules) 조합해서 내려주는 핵심
 *
 * 옵션(권장):
 * - ?day=YYYY-MM-DD  : 해당 주(일~토) 기준으로 멤버별 스케줄 blocks 내려줌
 */
export const getMeetDetail = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const meetId = Number(req.params.meetId);
    if (!Number.isFinite(meetId)) {
      return res.status(400).json({ message: 'meetId 형식이 올바르지 않습니다.' });
    }

    // 가입 여부 체크
    const membership = await prisma.member.findUnique({
      where: {
        group_id_user_id: {
          group_id: meetId,
          user_id: req.user.user_id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ message: '해당 모임에 가입되어 있지 않습니다.' });
    }

    const group = await prisma.group.findUnique({ where: { group_id: meetId } });
    if (!group) {
      return res.status(404).json({ message: '해당 모임을 찾을 수 없습니다.' });
    }

    const members = await prisma.member.findMany({
      where: { group_id: meetId },
      select: { user_id: true },
    });
    const memberIds = members.map((m) => m.user_id);

    const users = await prisma.weBandUser.findMany({
      where: { user_id: { in: memberIds } },
      select: { user_id: true, user_name: true, email: true, profile_img: true },
    });

    // (선택) 주간 스케줄까지 내려주기
    const day = req.query.day as string | undefined;
    let weekly: any = null;

    if (day) {
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
          user_id: { in: memberIds },
          date: { gte: startDate, lte: endDate },
        },
        select: { user_id: true, date: true, block_data: true },
      });

      // userId -> (dateStr -> blocks)
      const map = new Map<number, Map<string, number[]>>();
      for (const s of schedules) {
        const dateStr = s.date.toISOString().split('T')[0];
        const blocks = binaryToBlocks(s.block_data as Buffer);
        if (!map.has(s.user_id)) map.set(s.user_id, new Map());
        map.get(s.user_id)!.set(dateStr, blocks);
      }

      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
      }

      weekly = {
        startDate: startDate.toISOString().split('T')[0],
        days,
        members: memberIds.map((uid) => ({
          userId: uid,
          days: days.map((dateStr) => ({
            date: dateStr,
            blocks: map.get(uid)?.get(dateStr) ?? new Array(30).fill(0),
          })),
        })),
      };
    }

    return res.status(200).json({
      meet: {
        groupId: group.group_id,
        groupName: group.group_name,
        groupDate: group.group_date.toISOString().split('T')[0],
        ownerId: group.owner_id,
      },
      members: users.map((u) => ({
        userId: u.user_id,
        name: u.user_name,
        email: u.email,
        profileImg: u.profile_img,
      })),
      weeklySchedule: weekly, // day 없으면 null
    });
  } catch (error: any) {
    logger.error('모임 상세 조회 실패: ' + error.message);
    return res.status(500).json({ message: '모임 상세 조회 중 오류가 발생했습니다.' });
  }
};

/**
 * PATCH /meets/:meetId
 * owner 체크
 *
 * body 예시:
 * { "groupName": "새이름", "groupDate": "2025-12-20" }
 */
export const updateMeet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const meetId = Number(req.params.meetId);
    if (!Number.isFinite(meetId)) {
      return res.status(400).json({ message: 'meetId 형식이 올바르지 않습니다.' });
    }

    const group = await prisma.group.findUnique({ where: { group_id: meetId } });
    if (!group) {
      return res.status(404).json({ message: '해당 모임을 찾을 수 없습니다.' });
    }

    if (group.owner_id !== req.user.user_id) {
      return res.status(403).json({ message: '모임 수정 권한이 없습니다.' });
    }

    const { groupName, groupDate } = req.body as { groupName?: string; groupDate?: string };

    const data: any = {};
    if (groupName !== undefined) {
      if (!groupName.trim())
        return res.status(400).json({ message: 'groupName 값이 올바르지 않습니다.' });
      data.group_name = groupName.trim();
    }
    if (groupDate !== undefined) {
      const date = new Date(groupDate);
      if (isNaN(date.getTime()))
        return res.status(400).json({ message: 'groupDate 형식이 올바르지 않습니다.' });
      data.group_date = date;
    }

    const updated = await prisma.group.update({
      where: { group_id: meetId },
      data,
    });

    return res.status(200).json({
      message: '모임 정보가 수정되었습니다.',
      meet: {
        groupId: updated.group_id,
        groupName: updated.group_name,
        groupDate: updated.group_date.toISOString().split('T')[0],
        ownerId: updated.owner_id,
      },
    });
  } catch (error: any) {
    logger.error('모임 수정 실패: ' + error.message);
    return res.status(500).json({ message: '모임 수정 중 오류가 발생했습니다.' });
  }
};

/**
 * DELETE /meets/:meetId
 * owner 체크 + member 정리
 */
export const deleteMeet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const meetId = Number(req.params.meetId);
    if (!Number.isFinite(meetId)) {
      return res.status(400).json({ message: 'meetId 형식이 올바르지 않습니다.' });
    }

    const group = await prisma.group.findUnique({ where: { group_id: meetId } });
    if (!group) {
      return res.status(404).json({ message: '해당 모임을 찾을 수 없습니다.' });
    }

    if (group.owner_id !== req.user.user_id) {
      return res.status(403).json({ message: '모임 삭제 권한이 없습니다.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.member.deleteMany({ where: { group_id: meetId } });
      await tx.group.delete({ where: { group_id: meetId } });
    });

    return res.status(200).json({ message: '모임이 삭제되었습니다.' });
  } catch (error: any) {
    logger.error('모임 삭제 실패: ' + error.message);
    return res.status(500).json({ message: '모임 삭제 중 오류가 발생했습니다.' });
  }
};

/**
 * DELETE /meets/:meetId/exit/:userId
 * 본인 탈퇴 vs 강퇴 권한 처리
 *
 * - 본인 탈퇴: actor(user) == target(userId)
 * - 강퇴: actor는 owner여야 함
 * - owner는 탈퇴/강퇴 대상이 될 수 없음(정책)
 */
export const exitMeetOrKick = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: '인증에 실패했습니다. 다시 로그인해주세요.' });
    }

    const meetId = Number(req.params.meetId);
    const targetUserId = Number(req.params.userId);

    if (!Number.isFinite(meetId) || !Number.isFinite(targetUserId)) {
      return res.status(400).json({ message: '파라미터 형식이 올바르지 않습니다.' });
    }

    const group = await prisma.group.findUnique({ where: { group_id: meetId } });
    if (!group) {
      return res.status(404).json({ message: '해당 모임을 찾을 수 없습니다.' });
    }

    const actorUserId = req.user.user_id;
    const isOwner = group.owner_id === actorUserId;
    const isSelf = actorUserId === targetUserId;

    if (!isOwner && !isSelf) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    if (targetUserId === group.owner_id) {
      return res.status(400).json({ message: '모임장은 탈퇴/강퇴 처리할 수 없습니다.' });
    }

    const targetMembership = await prisma.member.findUnique({
      where: {
        group_id_user_id: {
          group_id: meetId,
          user_id: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ message: '해당 사용자는 모임에 가입되어 있지 않습니다.' });
    }

    await prisma.member.delete({
      where: {
        group_id_user_id: {
          group_id: meetId,
          user_id: targetUserId,
        },
      },
    });

    return res.status(200).json({
      message: isSelf ? '모임에서 탈퇴했습니다.' : '해당 사용자를 강퇴했습니다.',
    });
  } catch (error: any) {
    logger.error('모임 탈퇴/강퇴 실패: ' + error.message);
    return res.status(500).json({ message: '모임 탈퇴/강퇴 처리 중 오류가 발생했습니다.' });
  }
};
