/**
 * Production-safe logger utility
 *
 * Only logs in development mode to prevent information leakage in production.
 * All sensitive operations should use this instead of console.log directly.
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  /**
   * Log debug information (development only)
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args)
    }
  },

  /**
   * Log informational messages (development only)
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args)
    }
  },

  /**
   * Log warnings (development only)
   */
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn(...args)
    }
  },

  /**
   * Log errors - these are always logged but sanitized
   * Never log full error objects, only safe messages
   */
  error: (message: string, errorContext?: { code?: string | number }) => {
    const safeContext = errorContext?.code ? ` [${errorContext.code}]` : ''
    console.error(`Error: ${message}${safeContext}`)
  },
}

/**
 * Redact sensitive values for any logging that must occur
 */
export function redactSensitive(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '***'
  }
  return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`
}

/**
 * Redact wallet address for logging
 */
export function redactAddress(address: string): string {
  if (!address || address.length < 10) {
    return '***'
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
