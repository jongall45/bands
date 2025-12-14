import dotenv from 'dotenv'

dotenv.config()

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Polymarket
  clobApi: (process.env.CLOB_API || 'https://clob.polymarket.com').trim(),
  gammaApi: (process.env.GAMMA_API || 'https://gamma-api.polymarket.com').trim(),
  chainId: parseInt(process.env.CHAIN_ID || '137', 10),
  
  // Builder credentials (for attribution)
  builderApiKey: (process.env.POLYMARKET_BUILDER_API_KEY || '').trim(),
  builderSecret: (process.env.POLYMARKET_BUILDER_API_SECRET || '').trim(),
  builderPassphrase: (process.env.POLYMARKET_BUILDER_PASSPHRASE || '').trim(),
  
  // Frontend origin (for CORS)
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'https://www.bands.cash',
  
  // Cache TTLs (in seconds)
  cache: {
    marketMetadata: 60,     // Market info rarely changes
    marketStats: 10,        // Prices change frequently
    orderbook: 5,           // Orderbook is very dynamic
    positions: 5,           // User positions
    orders: 3,              // Order status changes fast
  },
  
  // Rate limits (requests per minute per wallet)
  rateLimit: {
    ordersPerMinute: 30,
    queriesPerMinute: 60,
    globalPerMinute: 1000,
  },
  
  // Request behavior
  request: {
    timeout: 10000,
    retries: 2,
    retryDelay: 1000,
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
}

// Validate required config
export function validateConfig(): void {
  // Log credential status (safe - no secrets)
  const hasKey = !!config.builderApiKey
  const hasSecret = !!config.builderSecret
  const hasPass = !!config.builderPassphrase
  const keyLen = config.builderApiKey.length
  const secretLen = config.builderSecret.length
  const passLen = config.builderPassphrase.length
  
  console.log(`[Config] Builder credentials: hasKey=${hasKey} hasSecret=${hasSecret} hasPass=${hasPass} keyLen=${keyLen} secretLen=${secretLen} passLen=${passLen}`)
  console.log(`[Config] CLOB API: ${config.clobApi}`)
  console.log(`[Config] Gamma API: ${config.gammaApi}`)
  
  if (!hasKey || !hasSecret || !hasPass) {
    console.warn(`⚠️ Missing builder credentials - Builder attribution will be disabled`)
  }
}
