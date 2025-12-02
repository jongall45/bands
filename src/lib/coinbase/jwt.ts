import * as crypto from 'crypto'

const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID!
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET!

// Base64URL encode
function base64url(input: Buffer | string): string {
  const str = typeof input === 'string' ? input : input.toString('base64')
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Create JWT manually using Node crypto
export async function generateCoinbaseJWT(
  requestMethod: string,
  requestPath: string
): Promise<string> {
  const uri = `${requestMethod} api.developer.coinbase.com${requestPath}`
  
  const now = Math.floor(Date.now() / 1000)
  
  // JWT Header
  const header = {
    alg: 'ES256',
    kid: CDP_API_KEY_ID,
    typ: 'JWT',
    nonce: crypto.randomUUID(),
  }
  
  // JWT Payload
  const payload = {
    sub: CDP_API_KEY_ID,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [uri],
    iat: now,
    exp: now + 120, // 2 minutes
    nbf: now - 5,
  }
  
  // Encode header and payload
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const message = `${headerB64}.${payloadB64}`
  
  try {
    // Decode the secret - it's base64 encoded EC private key
    const secretBytes = Buffer.from(CDP_API_KEY_SECRET, 'base64')
    
    // The secret should be 64 bytes: 32 bytes private key + 32 bytes... or just 32 bytes
    // Take first 32 bytes as the private key scalar
    const privateKeyD = secretBytes.slice(0, 32)
    
    // Create the key object using crypto.createPrivateKey with JWK format
    const privateKey = crypto.createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        d: base64url(privateKeyD),
        // We don't have x,y but Node.js can derive them
      },
      format: 'jwk',
    })
    
    // Sign
    const sign = crypto.createSign('SHA256')
    sign.update(message)
    const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    
    const signatureB64 = base64url(signature)
    
    return `${message}.${signatureB64}`
  } catch (error) {
    console.error('JWT generation error:', error)
    throw error
  }
}
