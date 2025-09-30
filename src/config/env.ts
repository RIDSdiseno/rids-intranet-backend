import 'dotenv/config';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  JWT_SECRET: process.env.JWT_SECRET || 'change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  DATABASE_URL: process.env.DATABASE_URL || '',
};
