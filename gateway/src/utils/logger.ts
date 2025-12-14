import winston from 'winston'
import { config } from '../config/index.js'
import { redactWallet, safeCredsLog, safeOrderLog, redactString } from './redact.js'

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

/**
 * Structured logging for trading operations (EOA-only mode)
 * 
 * Uses redaction helpers to ensure no secrets are logged.
 * 
 * Logs:
 * - wallet (first 10 chars)
 * - hasUserCreds
 * - credTypeUsed: USER | BUILDER | NONE
 * - status code + message
 * - request path
 */
export function logTradingEvent(
  event: 'auth_challenge' | 'auth_complete' | 'cred_derive' | 'order_submit' | 'order_result',
  wallet: string,
  details: {
    hasUserCreds?: boolean
    credTypeUsed?: 'USER' | 'BUILDER' | 'NONE'
    statusCode?: number
    message?: string
    path?: string
    signatureType?: number
    orderId?: string
    success?: boolean
    error?: string
  }
) {
  // Use redaction helper for wallet
  const safeWallet = redactWallet(wallet)
  
  const logData: Record<string, unknown> = {
    event,
    wallet: safeWallet,
  }
  
  if (details.hasUserCreds !== undefined) logData.hasUserCreds = details.hasUserCreds
  if (details.credTypeUsed) logData.credTypeUsed = details.credTypeUsed
  if (details.statusCode) logData.statusCode = details.statusCode
  // Redact any potential secrets in message
  if (details.message) logData.message = redactString(details.message)
  if (details.path) logData.path = details.path
  if (details.signatureType !== undefined) logData.signatureType = details.signatureType
  if (details.orderId) logData.orderId = details.orderId
  if (details.success !== undefined) logData.success = details.success
  // Redact any potential secrets in error
  if (details.error) logData.error = redactString(details.error)
  
  const level = details.success === false || details.error ? 'warn' : 'info'
  logger.log(level, `[Trading] ${event}: ${JSON.stringify(logData)}`)
}

/**
 * Log order details safely (with redaction)
 */
export function logOrderSafe(
  action: 'received' | 'validated' | 'submitting' | 'result',
  order: Record<string, unknown>,
  creds: { apiKey?: string; secret?: string; passphrase?: string } | null
) {
  const safeOrder = safeOrderLog(order)
  const safeCreds = safeCredsLog(creds)
  
  logger.info(`[Order ${action}] order=${JSON.stringify(safeOrder)} creds=${JSON.stringify(safeCreds)}`)
}

/**
 * Log credential derivation attempt
 */
export function logCredDerivation(
  wallet: string,
  success: boolean,
  details?: {
    statusCode?: number
    error?: string
    keyLen?: number
  }
) {
  logTradingEvent('cred_derive', wallet, {
    success,
    hasUserCreds: success,
    credTypeUsed: success ? 'USER' : 'NONE',
    statusCode: details?.statusCode,
    error: details?.error,
    message: success 
      ? `Derived creds (keyLen=${details?.keyLen || 0})`
      : `Derivation failed: ${details?.error || 'Unknown'}`,
  })
}
