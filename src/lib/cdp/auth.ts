import * as crypto from 'crypto'

// Support both naming conventions for CDP credentials
// Primary: COINBASE_CDP_API_KEY_NAME, COINBASE_CDP_API_KEY_PRIVATE_KEY (used by other routes)
// Fallback: CDP_API_KEY, CDP_API_SECRET (legacy)
const CDP_API_KEY = process.env.COINBASE_CDP_API_KEY_NAME || process.env.CDP_API_KEY
const CDP_API_SECRET = process.env.COINBASE_CDP_API_KEY_PRIVATE_KEY || process.env.CDP_API_SECRET

export const ONRAMP_API_BASE_URL = 'https://api.developer.coinbase.com'

/**
 * Get CDP credentials from environment
 */
export function getCDPCredentials() {
  if (!CDP_API_KEY || !CDP_API_SECRET) {
    throw new Error('CDP API credentials not configured')
  }
  return { apiKey: CDP_API_KEY, apiSecret: CDP_API_SECRET }
}

/**
 * Base64URL encode
 */
function base64url(input: Buffer | string): string {
  const str = typeof input === 'string' ? input : input.toString('base64')
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * P-256 curve parameters for computing Y from X
 */
const P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')

function mod(a: bigint, p: bigint): bigint {
  const result = a % p
  return result >= 0n ? result : result + p
}

function modPow(base: bigint, exp: bigint, p: bigint): bigint {
  let result = 1n
  base = mod(base, p)
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = mod(result * base, p)
    }
    exp = exp / 2n
    base = mod(base * base, p)
  }
  return result
}

/**
 * Compute Y coordinate from X for P-256 curve
 * y² = x³ - 3x + b (mod p)
 * Returns both possible Y values - caller should try both if needed
 */
function computeY(xBytes: Buffer, useNegativeY: boolean = false): Buffer {
  const x = BigInt('0x' + xBytes.toString('hex'))
  const b = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b')
  
  // y² = x³ - 3x + b
  const x3 = mod(modPow(x, 3n, P), P)
  const threeX = mod(3n * x, P)
  const y2 = mod(x3 - threeX + b, P)
  
  // y = y²^((p+1)/4) mod p (works because p ≡ 3 mod 4 for P-256)
  const exp = (P + 1n) / 4n
  let y = modPow(y2, exp, P)
  
  // Use the negative Y if requested (p - y)
  if (useNegativeY) {
    y = P - y
  }
  
  // Convert to 32-byte buffer
  let yHex = y.toString(16)
  while (yHex.length < 64) yHex = '0' + yHex
  return Buffer.from(yHex, 'hex')
}

/**
 * Generate JWT for CDP API authentication using Node's native crypto
 */
export async function generateCDPJWT(params: {
  requestMethod: string
  requestHost: string
  requestPath: string
}): Promise<string> {
  const { apiKey, apiSecret } = getCDPCredentials()
  
  // Get App ID for the 'sub' claim - this is different from the API Key ID
  const appId = process.env.NEXT_PUBLIC_COINBASE_APP_ID
  
  const uri = `${params.requestMethod} ${params.requestHost}${params.requestPath}`
  const now = Math.floor(Date.now() / 1000)
  
  // JWT Header - kid is the API Key ID
  const header = {
    alg: 'ES256',
    kid: apiKey,
    typ: 'JWT',
    nonce: crypto.randomUUID(),
  }
  
  // JWT Payload - sub should be the App ID, not the API Key ID
  // Also use 'uri' (singular) format which matches Coinbase's expected format
  const payload = {
    iss: 'cdp',
    nbf: now - 5,
    exp: now + 120, // 2 minutes
    sub: appId || apiKey, // Prefer App ID, fallback to API Key
    uri: `https://${params.requestHost}${params.requestPath}`,
  }
  
  // Encode header and payload
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const message = `${headerB64}.${payloadB64}`
  
  // Handle both PEM and base64 secret formats
  let privateKey: crypto.KeyObject
  
  if (apiSecret.includes('-----BEGIN')) {
    // PEM format
    const pemKey = apiSecret.replace(/\\n/g, '\n')
    privateKey = crypto.createPrivateKey(pemKey)
  } else {
    // Base64 encoded raw EC key from CDP
    // Format: 32 bytes d (private key) + 32 bytes x (public key x-coordinate)
    const secretBytes = Buffer.from(apiSecret, 'base64')
    const privateKeyD = secretBytes.slice(0, 32)
    const publicKeyX = secretBytes.slice(32, 64)
    
    // Try with negative Y (the other valid point on the curve)
    // EC curves have two Y values for each X - we need the correct one
    const publicKeyY = computeY(publicKeyX, true) // Use negative Y
    
    privateKey = crypto.createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        d: base64url(privateKeyD),
        x: base64url(publicKeyX),
        y: base64url(publicKeyY),
      },
      format: 'jwk',
    })
  }
  
  // Sign using ES256 with ieee-p1363 encoding (required for JWT)
  const sign = crypto.createSign('SHA256')
  sign.update(message)
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
  
  const signatureB64 = base64url(signature)
  
  return `${message}.${signatureB64}`
}

/**
 * Make authenticated request to CDP API
 */
export async function cdpFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method || 'GET'
  const url = new URL(path, ONRAMP_API_BASE_URL)
  
  const jwt = await generateCDPJWT({
    requestMethod: method,
    requestHost: url.hostname,
    requestPath: url.pathname,
  })

  return fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
      ...options.headers,
    },
  })
}

