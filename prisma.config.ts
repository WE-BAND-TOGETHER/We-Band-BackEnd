import { defineConfig } from '@prisma/config';

export default defineConfig({
  adapter: {
    provider: 'mysql',
    url: process.env.DATABASE_URL!,
  },
});
