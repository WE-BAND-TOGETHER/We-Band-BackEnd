import authRoutes from './routes/authRoutes';
import express from 'express';
import { prisma } from './prisma';
import cookieParser from 'cookie-parser';

const app = express();
app.use(express.json());
app.use(cookieParser());

// 1) 라우터 먼저 등록
app.use('/auth', authRoutes);

// 2) 테스트 라우트
app.get('/', (req, res) => {
  res.send('Hello from Express + Prisma + RDS!');
});

// 3) DB Test 라우트
app.get('/test-db', async (req, res) => {
  try {
    const now = await prisma.$queryRaw`SELECT NOW()`;
    res.json(now);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB Error');
  }
});

// 4) 마지막에 listen
app.listen(4000, () => {
  console.log('Server running at http://localhost:4000');
});
