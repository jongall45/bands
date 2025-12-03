import { SignJWT, importPKCS8 } from 'jose'

const CDP_API_KEY = process.env.CDP_API_KEY!
const CDP_API_SECRET = process.env.CDP_API_SECRET!

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
 * Convert Base64 secret to PEM format for ES256 signing
 */
function base64ToPem(base64Secret: string): string {
  const pemHeader = '-----BEGIN EC PRIVATE KEY-----\n'
  const pemFooter = '\n-----END EC PRIVATE KEY-----'
  
  // Format the base64 string with line breaks every 64 chars
  const formatted = base64Secret.match(/.{1,64}/g)?.join('\n') || base64Secret
  
  return pemHeader + formatted + pemFooter
}

/**
 * Generate JWT for CDP API authentication
 */
export async function generateCDPJWT(params: {
  requestMethod: string
  requestHost: string
  requestPath: string
}): Promise<string> {
  const { apiKey, apiSecret } = getCDPCredentials()
  
  const uri = `${params.requestMethod} ${params.requestHost}${params.requestPath}`
  
  // Try to import the key - CDP uses ES256 (ECDSA with P-256)
  let privateKey
  
  try {
    const pemKey = base64ToPem(apiSecret)
    privateKey = await importPKCS8(pemKey, 'ES256')
  } catch {
    throw new Error('Failed to import CDP API key. Ensure the key is in the correct format.')
  }

  const jwt = await new SignJWT({
    sub: apiKey,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [uri],
  })
    .setProtectedHeader({ 
      alg: 'ES256', 
      kid: apiKey,
      typ: 'JWT',
      nonce: crypto.randomUUID()
    })
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000) - 5)
    .setExpirationTime('2m')
    .sign(privateKey)

  return jwt
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

