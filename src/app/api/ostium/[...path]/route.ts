import { NextRequest, NextResponse } from 'next/server'

const OSTIUM_BASE = 'https://metadata-backend.ostium.io'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const url = `${OSTIUM_BASE}/${pathStr}`
    
    console.log('Proxying Ostium request to:', url)
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Cache for 5 seconds
      next: { revalidate: 5 }
    })
    
    if (!response.ok) {
      console.error('Ostium API error:', response.status, response.statusText)
      throw new Error(`Ostium API error: ${response.status}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Ostium proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch from Ostium' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const url = `${OSTIUM_BASE}/${pathStr}`
    const body = await request.json()
    
    console.log('Proxying Ostium POST to:', url)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })
    
    if (!response.ok) {
      console.error('Ostium API error:', response.status, response.statusText)
      throw new Error(`Ostium API error: ${response.status}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Ostium proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch from Ostium' },
      { status: 500 }
    )
  }
}

