import { SignJWT, importPKCS8 } from 'jose'
import * as crypto from 'crypto'

const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID!
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET!

// Convert the base64 secret to PEM format for ES256
function secretToPem(base64Secret: string): string {
  const secretBytes = Buffer.from(base64Secret, 'base64')
  // Take first 32 bytes as the private key scalar
  const privateKeyBytes = secretBytes.slice(0, 32)
  
  // Build DER encoding for EC private key
  const derPrefix = Buffer.from([
    0x30, 0x41, // SEQUENCE, length 65
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x13, // SEQUENCE, length 19 (algorithm identifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID 1.2.840.10045.2.1 (ecPublicKey)
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID 1.2.840.10045.3.1.7 (P-256)
    0x04, 0x27, // OCTET STRING, length 39
    0x30, 0x25, // SEQUENCE, length 37
    0x02, 0x01, 0x01, // INTEGER 1 (version)
    0x04, 0x20, // OCTET STRING, length 32
  ])
  
  const derBytes = Buffer.concat([derPrefix, privateKeyBytes])
  const base64Der = derBytes.toString('base64')
  
  return `-----BEGIN EC PRIVATE KEY-----\n${base64Der.match(/.{1,64}/g)?.join('\n')}\n-----END EC PRIVATE KEY-----`
}

export async function generateCoinbaseJWT(
  requestMethod: string,
  requestPath: string
): Promise<string> {
  const uri = `${requestMethod} api.developer.coinbase.com${requestPath}`
  
  // Convert secret to PEM format
  const pemKey = secretToPem(CDP_API_KEY_SECRET)
  
  // Import the key
  const privateKey = await importPKCS8(pemKey, 'ES256')

  const jwt = await new SignJWT({
    sub: CDP_API_KEY_ID,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [uri],
  })
    .setProtectedHeader({ 
      alg: 'ES256', 
      kid: CDP_API_KEY_ID,
      typ: 'JWT',
      nonce: crypto.randomUUID(),
    })
    .setIssuedAt()
    .setExpirationTime('2m')
    .setNotBefore(Math.floor(Date.now() / 1000) - 5)
    .sign(privateKey)

  return jwt
}

