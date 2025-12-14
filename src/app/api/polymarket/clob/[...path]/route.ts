import { NextRequest, NextResponse } from 'next/server'

const CLOB_API = 'https://clob.polymarket.com'

/**
 * Universal CLOB Proxy
 * 
 * This proxies ALL requests to clob.polymarket.com to avoid CORS and Cloudflare blocks.
 * The ClobClient can be configured to use this proxy as its host.
 * 
 * Example: Instead of https://clob.polymarket.com/order
 * Use: https://yourdomain.com/api/polymarket/clob/order
 */

// Headers to forward from client to Polymarket
const FORWARD_HEADERS = [
  'poly_api_key',
  'poly_signature', 
  'poly_timestamp',
  'poly_passphrase',
  'poly_address',
  'poly_builder_api_key',
  'poly_builder_signature',
  'poly_builder_timestamp',
  'poly_builder_passphrase',
]

function getProxiedHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    // Browser-like headers to avoid Cloudflare blocks
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  
  // Forward Polymarket auth headers (case-insensitive lookup)
  for (const headerName of FORWARD_HEADERS) {
    const value = request.headers.get(headerName) || request.headers.get(headerName.toUpperCase())
    if (value) {
      headers[headerName.toUpperCase()] = value
    }
  }
  
  return headers
}

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] }
): Promise<NextResponse> {
  const path = '/' + params.path.join('/')
  const url = new URL(path, CLOB_API)
  
  // Forward query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })
  
  const headers = getProxiedHeaders(request)
  
  console.log(`[CLOB Proxy] ${request.method} ${url.toString()}`)
  
  let body: string | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.text()
    } catch {
      // No body
    }
  }
  
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body,
    })
    
    const responseText = await response.text()
    
    console.log(`[CLOB Proxy] Response: ${response.status} ${responseText.substring(0, 200)}`)
    
    // Check for Cloudflare block
    if (responseText.includes('Cloudflare') && responseText.includes('blocked')) {
      console.error('[CLOB Proxy] Cloudflare blocked the request')
      return NextResponse.json(
        { error: 'Request blocked by Cloudflare. Please try again later.' },
        { status: 403 }
      )
    }
    
    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText)
      return NextResponse.json(data, { status: response.status })
    } catch {
      // Return as text if not JSON
      return new NextResponse(responseText, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' },
      })
    }
  } catch (error) {
    console.error('[CLOB Proxy] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}
