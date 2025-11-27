import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import path from 'path';
import appRoot from 'app-root-path';
import morgan from 'morgan';
import type { StreamOptions } from 'morgan';
import { Request, Response, NextFunction } from 'express';

// 환경에 따라 로그 레벨 다름
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const logDir = path.join(appRoot.path, 'logs');

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => `${info.level}: ${info.message}`),
      ),
      level: logLevel,
    }),

    new winstonDaily({
      level: logLevel,
      datePattern: 'YYYY-ww',
      dirname: logDir,
      filename: 'application-%DATE%.log',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '2w',
    }),
  ],
});

const stream: StreamOptions = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

const morganMiddleware =
  process.env.NODE_ENV === 'dev'
    ? morgan('tiny', { stream })
    : (req: Request, res: Response, next: NextFunction) => next();

const specificLogger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => `${info.level}: ${info.message}`),
      ),
    }),

    new winstonDaily({
      datePattern: 'YYYY-MM',
      dirname: logDir,
      filename: 'specific-%DATE%.log',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '1m',
    }),
  ],
});

export { logger, specificLogger, morganMiddleware };
