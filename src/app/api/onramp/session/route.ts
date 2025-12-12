import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'

const ONRAMP_API_URL = 'https://api.developer.coinbase.com/onramp/v1/token'

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 10
const RATE_LIMIT_WINDOW = 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (record.count >= RATE_LIMIT) return false
  record.count++
  return true
}

function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://bands.cash,https://www.bands.cash').split(',')
  if (!origin) return true
  return allowedOrigins.some(allowed => origin.startsWith(allowed.trim()))
}

function base64url(input: Buffer | string): string {
  const str = typeof input === 'string' ? input : input.toString('base64')
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// P-256 curve parameters for public key derivation
const P = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF')
const A = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC')
const Gx = BigInt('0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296')
const Gy = BigInt('0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5')

function mod(n: bigint, p: bigint): bigint {
  const result = n % p
  return result >= 0n ? result : result + p
}

function modInverse(a: bigint, p: bigint): bigint {
  let [old_r, r] = [a, p]
  let [old_s, s] = [1n, 0n]
  while (r !== 0n) {
    const q = old_r / r
    ;[old_r, r] = [r, old_r - q * r]
    ;[old_s, s] = [s, old_s - q * s]
  }
  return mod(old_s, p)
}

function pointAdd(x1: bigint, y1: bigint, x2: bigint, y2: bigint): [bigint, bigint] {
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]
  let lambda: bigint
  if (x1 === x2 && y1 === y2) {
    lambda = mod((3n * x1 * x1 + A) * modInverse(2n * y1, P), P)
  } else {
    lambda = mod((y2 - y1) * modInverse(mod(x2 - x1, P), P), P)
  }
  const x3 = mod(lambda * lambda - x1 - x2, P)
  const y3 = mod(lambda * (x1 - x3) - y1, P)
  return [x3, y3]
}

function pointMultiply(k: bigint, x: bigint, y: bigint): [bigint, bigint] {
  let [rx, ry] = [0n, 0n]
  let [qx, qy] = [x, y]
  while (k > 0n) {
    if (k & 1n) [rx, ry] = pointAdd(rx, ry, qx, qy)
    ;[qx, qy] = pointAdd(qx, qy, qx, qy)
    k >>= 1n
  }
  return [rx, ry]
}

function computePublicKey(privateKeyD: Buffer): Buffer {
  const d = BigInt('0x' + privateKeyD.toString('hex'))
  const [x, y] = pointMultiply(d, Gx, Gy)
  const xBuf = Buffer.from(x.toString(16).padStart(64, '0'), 'hex')
  const yBuf = Buffer.from(y.toString(16).padStart(64, '0'), 'hex')
  return Buffer.concat([Buffer.from([0x04]), xBuf, yBuf])
}

/**
 * Parse SEC1 EC private key PEM and extract the raw private key (d)
 */
function extractPrivateKeyD(pem: string): Buffer {
  const base64 = pem
    .replace('-----BEGIN EC PRIVATE KEY-----', '')
    .replace('-----END EC PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  
  const der = Buffer.from(base64, 'base64')
  
  let offset = 0
  if (der[offset] !== 0x30) throw new Error('Invalid SEC1: expected SEQUENCE')
  offset++
  if (der[offset] & 0x80) {
    offset += (der[offset] & 0x7f) + 1
  } else {
    offset++
  }
  if (der[offset] !== 0x02) throw new Error('Invalid SEC1: expected INTEGER for version')
  offset += 3
  if (der[offset] !== 0x04) throw new Error('Invalid SEC1: expected OCTET STRING for d')
  offset++
  const dLen = der[offset]
  offset++
  
  return der.slice(offset, offset + dLen)
}

async function generateJWT(apiKeyId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const formattedKey = privateKeyPem.replace(/\\n/g, '\n').trim()
  
  // Extract d and compute public key (x, y) using P-256 curve math
  const d = extractPrivateKeyD(formattedKey)
  const publicKeyUncompressed = computePublicKey(d)
  const x = publicKeyUncompressed.slice(1, 33)
  const y = publicKeyUncompressed.slice(33, 65)
  
  const privateKey = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64url(d),
      x: base64url(x),
      y: base64url(y),
    },
    format: 'jwk',
  })
  
  // JWT Header
  const header = {
    alg: 'ES256',
    kid: apiKeyId,
    typ: 'JWT',
    nonce: crypto.randomUUID(),
  }
  
  // JWT Payload
  const payload = {
    sub: apiKeyId,
    iss: 'cdp',
    aud: ['cdp_service'],
    uri: `POST api.developer.coinbase.com/onramp/v1/token`,
    iat: now,
    exp: now + 120,
    nbf: now - 5,
  }
  
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const message = `${headerB64}.${payloadB64}`
  
  const sign = crypto.createSign('SHA256')
  sign.update(message)
  const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
  
  return `${message}.${base64url(signature)}`
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const apiKeyId = process.env.CDP_API_KEY_ID
    const apiKeySecret = process.env.CDP_API_KEY_SECRET

    if (!apiKeyId || !apiKeySecret) {
      return NextResponse.json({ error: 'CDP credentials not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { addresses, assets } = body
    
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: 'addresses is required' }, { status: 400 })
    }

    const jwt = await generateJWT(apiKeyId, apiKeySecret)
    
    const response = await fetch(ONRAMP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ addresses, assets: assets || ['USDC'] }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Coinbase Onramp API error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to generate session token' }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({ token: data.token })
  } catch (error: any) {
    console.error('Onramp session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
