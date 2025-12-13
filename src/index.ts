import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import { prisma } from './prisma';

const app = express();

app.use(
  cors({
    origin: ['http://localhost:3000', 'https://we-band.com', 'http://3.34.220.185'],
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// Auth
app.use('/auth', authRoutes);

// Me API
app.use('/me', userRoutes);

// Root
app.get('/', (req, res) => {
  res.send('Hello from Express + Prisma + RDS!');
});

// DB Test
app.get('/test-db', async (req, res) => {
  try {
    const now = await prisma.$queryRaw`SELECT NOW()`;
    res.json(now);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB Error');
  }
});

app.listen(4000, () => {
  console.log('Server running at http://localhost:4000');
});
