import winston from 'winston'
import { config } from '../../config/index.js'

const { combine, timestamp, json, printf, colorize } = winston.format

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : ''
  return `${timestamp} [${level}] ${message} ${metaStr}`
})

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    config.nodeEnv === 'production' ? json() : combine(colorize(), devFormat)
  ),
  defaultMeta: { service: 'polymarket-gateway' },
  transports: [
    new winston.transports.Console(),
  ],
})

// Request logging helper
export function logRequest(method: string, path: string, status: number, durationMs: number, meta?: Record<string, any>) {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  logger.log(level, `${method} ${path} ${status} ${durationMs}ms`, { ...meta, status, durationMs })
}

// Order lifecycle logging
export function logOrderEvent(
  event: 'signed' | 'validated' | 'submitted' | 'accepted' | 'rejected',
  orderId: string,
  wallet: string,
  meta?: Record<string, any>
) {
  logger.info(`Order ${event}`, { event, orderId, wallet, ...meta })
}

// Polymarket API call logging
export function logPolymarketCall(
  endpoint: string,
  method: string,
  durationMs: number,
  success: boolean,
  meta?: Record<string, any>
) {
  const level = success ? 'debug' : 'warn'
  logger.log(level, `Polymarket API: ${method} ${endpoint}`, { 
    polymarketCall: true, 
    endpoint, 
    method, 
    durationMs, 
    success,
    ...meta 
  })
}
