import authRoutes from './routes/authRoutes';
import express from 'express';
import { prisma } from './prisma';
import cookieParser from 'cookie-parser';

const app = express();
app.use(express.json());
app.use(cookieParser());

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

app.use('/auth', authRoutes);
