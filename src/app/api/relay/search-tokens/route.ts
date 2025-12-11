import { NextRequest, NextResponse } from 'next/server'

// Popular tokens database for search
const POPULAR_TOKENS: Record<number, any[]> = {
  8453: [ // Base
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' },
    { symbol: 'cbBTC', name: 'Coinbase BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png' },
    { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EescdeCB5BE3830/logo.png' },
    { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
    { symbol: 'BRETT', name: 'Brett', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18 },
    { symbol: 'DEGEN', name: 'Degen', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18 },
    { symbol: 'TOSHI', name: 'Toshi', address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', decimals: 18 },
    { symbol: 'HIGHER', name: 'Higher', address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', decimals: 18 },
  ],
  42161: [ // Arbitrum
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
    { symbol: 'USDC.e', name: 'Bridged USDC', address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
    { symbol: 'ARB', name: 'Arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png' },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    { symbol: 'GMX', name: 'GMX', address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
    { symbol: 'MAGIC', name: 'Magic', address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342', decimals: 18 },
  ],
  1: [ // Ethereum
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png' },
    { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png' },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    { symbol: 'DAI', name: 'Dai', address: '0x6B175474E89094C44Da98b954EedscdeCB5BE3830', decimals: 18 },
    { symbol: 'LINK', name: 'Chainlink', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
    { symbol: 'UNI', name: 'Uniswap', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
  ],
  10: [ // Optimism
    { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    { symbol: 'OP', name: 'Optimism', address: '0x4200000000000000000000000000000000000042', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png' },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
  137: [ // Polygon
    { symbol: 'MATIC', name: 'Polygon', address: '0x0000000000000000000000000000000000000000', decimals: 18, logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    { symbol: 'WMATIC', name: 'Wrapped MATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
  ],
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')
  const chainId = searchParams.get('chainId')

  if (!query || query.length < 2) {
    return NextResponse.json({ tokens: [] })
  }

  try {
    const queryLower = query.toLowerCase()
    const chainIds = chainId ? [parseInt(chainId)] : [8453, 42161, 1, 10, 137]
    const matchedTokens: any[] = []

    // Search through popular tokens
    chainIds.forEach(cid => {
      const tokens = POPULAR_TOKENS[cid] || []
      tokens.forEach(token => {
        if (
          token.symbol.toLowerCase().includes(queryLower) ||
          token.name.toLowerCase().includes(queryLower)
        ) {
          matchedTokens.push({
            ...token,
            chainId: cid,
          })
        }
      })
    })

    console.log(`[Token Search] Found ${matchedTokens.length} tokens for query: ${query}`)
    return NextResponse.json({ tokens: matchedTokens.slice(0, 20) })
  } catch (error) {
    console.error('[Token Search] Error:', error)
    return NextResponse.json({ tokens: [], error: 'Search failed' }, { status: 500 })
  }
}
