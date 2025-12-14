/**
 * Secrets Redaction Helper
 * 
 * Centralizes redaction of sensitive information from logs.
 * NEVER log: apiSecret, passphrase, raw signatures, full typedData
 */

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  /api[_-]?key[=:]\s*[a-zA-Z0-9_-]+/gi,
  /api[_-]?secret[=:]\s*[a-zA-Z0-9+/=_-]+/gi,
  /passphrase[=:]\s*[a-zA-Z0-9_-]+/gi,
  /secret[=:]\s*[a-zA-Z0-9+/=_-]+/gi,
  /password[=:]\s*[^\s,}]+/gi,
  /bearer\s+[a-zA-Z0-9._-]+/gi,
  /0x[a-fA-F0-9]{130,}/g, // Long signatures (65 bytes = 130 hex chars)
]

// Keys that should never be logged
const SENSITIVE_KEYS = [
  'apiSecret',
  'secret',
  'passphrase',
  'password',
  'signature',
  'privateKey',
  'mnemonic',
  'seed',
]

/**
 * Redact sensitive values from a string
 */
export function redactString(input: string): string {
  let result = input
  
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Keep the key part, redact the value
      const keyMatch = match.match(/^([a-zA-Z_-]+[=:])\s*/i)
      if (keyMatch) {
        return `${keyMatch[1]}***REDACTED***`
      }
      // Full redaction for signatures and tokens
      return '***REDACTED***'
    })
  }
  
  return result
}

/**
 * Redact sensitive values from an object (shallow)
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>
  
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase()
    
    // Check if key is sensitive
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      result[key] = '***REDACTED***'
      continue
    }
    
    // Check if value is a string and redact patterns
    if (typeof result[key] === 'string') {
      result[key] = redactString(result[key] as string)
    }
    
    // Truncate very long strings (likely signatures or encoded data)
    if (typeof result[key] === 'string' && (result[key] as string).length > 100) {
      const val = result[key] as string
      result[key] = `${val.slice(0, 20)}...${val.slice(-10)} (${val.length} chars)`
    }
  }
  
  return result as T
}

/**
 * Safe JSON stringify that redacts sensitive values
 */
export function safeStringify(obj: unknown, indent?: number): string {
  const replacer = (key: string, value: unknown): unknown => {
    // Redact sensitive keys
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      return '***REDACTED***'
    }
    
    // Truncate long strings
    if (typeof value === 'string' && value.length > 100) {
      // Check if it looks like a signature (hex string starting with 0x)
      if (value.startsWith('0x') && value.length > 66) {
        return `${value.slice(0, 20)}...${value.slice(-10)} (sig)`
      }
      return `${value.slice(0, 20)}...${value.slice(-10)} (${value.length} chars)`
    }
    
    return value
  }
  
  return JSON.stringify(obj, replacer, indent)
}

/**
 * Redact wallet address to show only first 10 chars
 */
export function redactWallet(address: string | null | undefined): string {
  if (!address) return 'none'
  return `${address.slice(0, 10)}...`
}

/**
 * Create a safe log object from user credentials
 * NEVER includes apiSecret or passphrase
 */
export function safeCredsLog(creds: { apiKey?: string; secret?: string; passphrase?: string } | null): {
  hasApiKey: boolean
  keyLen: number
  keyPrefix?: string
} {
  if (!creds) {
    return { hasApiKey: false, keyLen: 0 }
  }
  
  return {
    hasApiKey: !!creds.apiKey,
    keyLen: creds.apiKey?.length || 0,
    keyPrefix: creds.apiKey ? creds.apiKey.slice(0, 8) + '...' : undefined,
  }
}

/**
 * Create a safe log object from an order
 * Redacts signature and sensitive fields
 */
export function safeOrderLog(order: Record<string, unknown>): Record<string, unknown> {
  return {
    salt: order.salt ? String(order.salt).slice(0, 10) + '...' : undefined,
    maker: redactWallet(order.maker as string),
    signer: redactWallet(order.signer as string),
    tokenId: order.tokenId ? String(order.tokenId).slice(0, 20) + '...' : undefined,
    side: order.side,
    signatureType: order.signatureType,
    hasSignature: !!order.signature,
    signatureLen: typeof order.signature === 'string' ? order.signature.length : 0,
  }
}

/**
 * Validate that a string doesn't contain known secret patterns
 * Use in tests to verify logs are clean
 */
export function containsSecrets(str: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    if (pattern.test(str)) {
      return true
    }
  }
  
  // Check for long hex strings that might be signatures
  const longHexPattern = /0x[a-fA-F0-9]{130,}/g
  if (longHexPattern.test(str)) {
    return true
  }
  
  return false
}
