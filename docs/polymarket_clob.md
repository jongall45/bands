# Polymarket CLOB Integration

This document describes the Polymarket CLOB (Central Limit Order Book) integration for trading prediction markets.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Privy Wallet  │────▶│  Gnosis Safe     │────▶│  Polymarket     │
│   (EOA Signer)  │     │  (Asset Vault)   │     │  CLOB           │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │ Signs for             │ Holds funds
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  ClobClient     │     │  Native USDC     │
│  (SDK)          │     │  on Polygon      │
└─────────────────┘     └──────────────────┘
```

## Data Sources

### Markets List (Discovery)
- **Source**: Gamma API (`https://gamma-api.polymarket.com`)
- **Endpoint**: `/events?active=true&closed=false`
- **Caching**: 30 seconds (Next.js revalidate)
- **Used for**: Market discovery, trending events, search

### Live Prices
- **Source**: CLOB API (`https://clob.polymarket.com`)
- **Endpoint**: `/book?token_id={tokenId}`
- **Caching**: 2-5 seconds
- **Used for**: Real-time bid/ask, order placement

### Price Computation
We compute displayed odds from CLOB orderbook:
```typescript
// For BUYING: Use best ASK (what you pay)
// For SELLING: Use best BID (what you receive)  
// For DISPLAY: Use MID price (best bid + best ask) / 2

const mid = (bestBid + bestAsk) / 2
```

**Important**: Gamma API's `outcomePrices` can be stale. Always prefer CLOB orderbook for trading.

## Outcome Mapping

Polymarket does NOT guarantee outcome order. We dynamically find YES/NO:

```typescript
const yesIndex = outcomes.findIndex(o => 
  o.toLowerCase() === 'yes' || o.toLowerCase() === 'true'
)
```

**Token IDs**: `clobTokenIds[yesIndex]` is the YES token, `clobTokenIds[noIndex]` is the NO token.

## Order Execution Flow

### 1. Session Initialization
```
User connects → Privy EOA wallet provisioned → Safe derived/deployed → API credentials obtained
```

### 2. Order Placement
```typescript
import { placeOrder } from '@/lib/polymarket/placeOrder'

const result = await placeOrder(clobClient, {
  tokenId: market.yesTokenId,
  side: 'BUY',
  size: 10,      // 10 shares
  price: 0.65,   // 65 cents per share
  tickSize: '0.01',
})
```

### 3. Signature Types
- **signatureType = 2**: POLY_GNOSIS_SAFE (EOA signs for Safe)
- The EOA is the delegated signer
- The Safe is the asset holder ("funder")

## Environment Variables

```bash
# Builder API credentials (from Polymarket Builder Program)
POLYMARKET_BUILDER_API_KEY=...
POLYMARKET_BUILDER_API_SECRET=...
POLYMARKET_BUILDER_PASSPHRASE=...
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/polymarket/api.ts` | Market data types and parsing |
| `src/lib/polymarket/prices.ts` | CLOB price fetching with Decimal.js |
| `src/lib/polymarket/placeOrder.ts` | Robust order placement with retries |
| `src/lib/polymarket/relayer.ts` | Safe deployment and approvals |
| `src/lib/polymarket/constants.ts` | Contract addresses and ABIs |
| `src/hooks/usePolymarketTrade.ts` | React hook for trading |

## API Routes

| Route | Purpose |
|-------|---------|
| `/api/polymarket/events` | Proxy for Gamma API (markets list) |
| `/api/polymarket/price` | Get live price for a token |
| `/api/polymarket/orderbook` | Get full orderbook |
| `/api/polymarket/order` | Submit/cancel orders |
| `/api/polymarket/sign` | Builder signature endpoint |
| `/api/debug/polymarket-sanity` | Data sanity check |

## Running Smoke Tests

```bash
# Run e2e test suite
npx ts-node scripts/polymarket_e2e.ts

# Check data sanity (requires dev server running)
curl http://localhost:3000/api/debug/polymarket-sanity
```

## Common Issues

### 1. Prices Don't Match Polymarket UI
- **Cause**: Using stale Gamma prices instead of CLOB
- **Fix**: Use `fetchMarketPrices()` from `prices.ts`

### 2. Outcome Tokens Swapped
- **Cause**: Assuming `outcomes[0]` is always "Yes"
- **Fix**: Use dynamic index lookup in `parseMarket()`

### 3. Order Rejected
- **Cause**: Price not on tick, invalid size, or auth issue
- **Fix**: Use `roundToTick()` and validate with `placeOrder()`

### 4. Safe Not Deployed
- **Cause**: User hasn't completed setup
- **Fix**: Call `initializeSession()` in `usePolymarketSetup`

## Security Notes

1. **Never expose** `POLYMARKET_BUILDER_API_SECRET` to client
2. **Builder signing** happens server-side via `/api/polymarket/sign`
3. **User credentials** are stored in localStorage with 24h expiry
4. **Order signing** uses EIP-712 via ClobClient

## References

- [Polymarket Docs](https://docs.polymarket.com/)
- [clob-client](https://github.com/Polymarket/clob-client)
- [builder-relayer-client](https://github.com/Polymarket/builder-relayer-client)
- [privy-safe-builder-example](https://github.com/Polymarket/privy-safe-builder-example)
