import authRoutes from './routes/authRoutes';
import express from 'express';
import { prisma } from './prisma';
import cookieParser from 'cookie-parser';
import cors from 'cors';

const app = express();

app.use(
  cors({
    origin: ['http://localhost:3000', 'https://we-band.com', 'http://3.34.220.185'],
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Hello from Express + Prisma + RDS!');
});

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
