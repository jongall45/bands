import { NextRequest, NextResponse } from 'next/server'

const CLOB_API = 'https://clob.polymarket.com'

/**
 * Universal CLOB API Proxy
 * 
 * Proxies requests to clob.polymarket.com to avoid CORS issues.
 * 
 * Examples:
 * - /api/polymarket/proxy/book?token_id=xxx -> https://clob.polymarket.com/book?token_id=xxx
 * - /api/polymarket/proxy/order -> https://clob.polymarket.com/order
 * - /api/polymarket/proxy/positions?address=xxx -> https://clob.polymarket.com/positions?address=xxx
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
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  }

  // Forward Polymarket auth headers
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
  pathParts: string[]
): Promise<NextResponse> {
  const path = '/' + pathParts.join('/')
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
    console.log(`[CLOB Proxy] Response: ${response.status} ${responseText.slice(0, 200)}`)

    // Check for Cloudflare block
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('Cloudflare')) {
      console.error('[CLOB Proxy] Blocked by Cloudflare')
      return NextResponse.json(
        { error: 'Polymarket API temporarily unavailable' },
        { status: 503 }
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
        headers: { 'Content-Type': 'text/plain' },
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path)
}

// No caching for proxy requests
export const dynamic = 'force-dynamic'
