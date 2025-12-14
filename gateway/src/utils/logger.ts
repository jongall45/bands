import winston from 'winston'
import { config } from '../config/index.js'

const { combine, timestamp, printf, colorize } = winston.format

// Custom format for development
const devFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}] ${message}`
})

// Create logger instance
const winstonLogger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    config.nodeEnv === 'production' 
      ? winston.format.json() 
      : combine(colorize(), devFormat)
  ),
  defaultMeta: { service: 'polymarket-gateway' },
  transports: [
    new winston.transports.Console(),
  ],
})

// Simple logger wrapper that accepts string messages
export const logger = {
  info: (message: string) => winstonLogger.info(message),
  warn: (message: string) => winstonLogger.warn(message),
  error: (message: string) => winstonLogger.error(message),
  debug: (message: string) => winstonLogger.debug(message),
  log: (level: string, message: string) => winstonLogger.log(level, message),
}

// Request logging helper
export function logRequest(method: string, path: string, status: number, durationMs: number) {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  logger.log(level, `${method} ${path} ${status} ${durationMs}ms`)
}

// Order lifecycle logging
export function logOrderEvent(
  event: 'signed' | 'validated' | 'submitted' | 'accepted' | 'rejected',
  orderId: string,
  wallet: string,
  meta?: Record<string, unknown>
) {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  logger.info(`Order ${event}: ${orderId} wallet=${wallet}${metaStr}`)
}

// Polymarket API call logging
export function logPolymarketCall(
  endpoint: string,
  method: string,
  durationMs: number,
  success: boolean,
  meta?: Record<string, unknown>
) {
  const level = success ? 'debug' : 'warn'
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  logger.log(level, `Polymarket API: ${method} ${endpoint} ${durationMs}ms success=${success}${metaStr}`)
}
