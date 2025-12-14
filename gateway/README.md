# Polymarket Gateway

A long-lived Node.js service that handles all Polymarket API communication with a stable outbound IP.

## Why This Architecture?

Polymarket's Cloudflare protection blocks:
- Serverless function IPs (rotating)
- Datacenter IPs making bursty requests
- Bot-like traffic patterns

This gateway service:
- Runs as a persistent process with a stable IP
- Uses aggressive caching to minimize API calls
- Rate-limits requests to avoid abuse detection
- Behaves like a normal exchange gateway

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env
# Edit .env with your credentials

# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed stats (cache, memory) |

### Markets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/markets` | List markets (cached 60s) |
| GET | `/api/markets/:id` | Get market by ID (cached 60s) |
| GET | `/api/markets/:id/stats?tokenId=X` | Get orderbook (cached 5s) |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/order` | Submit signed order |
| GET | `/api/orders?address=X&apiKey=...` | Get user's orders |
| DELETE | `/api/order/:id` | Cancel order |

### Positions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/positions?address=X` | Get user's positions |

## Order Submission Flow

1. **Client** signs order using `ClobClient.createOrder()` (local, no network)
2. **Client** sends signed order to `POST /api/order`
3. **Gateway** validates:
   - Order schema
   - Ownership (signer matches owner)
   - Nonce (replay protection)
   - Rate limits
4. **Gateway** submits to Polymarket with proper auth headers
5. **Gateway** returns normalized response

### Request Format

```json
POST /api/order
{
  "order": {
    "salt": "...",
    "maker": "0x...",
    "signer": "0x...",
    "taker": "0x0000...",
    "tokenId": "123...",
    "makerAmount": "1000000",
    "takerAmount": "500000",
    "expiration": "0",
    "nonce": "...",
    "feeRateBps": "0",
    "side": 0,
    "signatureType": 2,
    "signature": "0x..."
  },
  "owner": "0x...",
  "orderType": "GTC",
  "userCreds": {
    "apiKey": "...",
    "secret": "...",
    "passphrase": "..."
  }
}
```

## Caching Strategy

| Resource | TTL | Purpose |
|----------|-----|---------|
| Market metadata | 60s | Market info rarely changes |
| Market stats | 10s | Prices update frequently |
| Orderbook | 5s | Very dynamic |
| Positions | 5s | Balance changes on trades |
| Orders | 3s | Order status updates fast |

Request deduplication prevents concurrent fetches for the same resource.

## Rate Limits

| Scope | Limit |
|-------|-------|
| Global | 1000/min |
| Orders per wallet | 30/min |
| Queries per wallet | 60/min |

## Deployment

### Railway (Recommended)

1. Connect GitHub repo to Railway
2. Set root directory to `/gateway`
3. Add environment variables
4. Deploy

Railway provides a stable outbound IP.

### Render

1. Create Web Service from GitHub
2. Set root directory to `/gateway`
3. Add environment variables
4. Deploy

### Docker

```bash
docker build -t polymarket-gateway .
docker run -p 3001:3001 --env-file .env polymarket-gateway
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default: 3001) |
| NODE_ENV | No | Environment (default: development) |
| POLYMARKET_BUILDER_API_KEY | Yes* | Builder API key |
| POLYMARKET_BUILDER_API_SECRET | Yes* | Builder secret |
| POLYMARKET_BUILDER_PASSPHRASE | Yes* | Builder passphrase |
| FRONTEND_ORIGIN | Yes | Frontend URL for CORS |

*Required for order attribution

## Security Checklist

- [ ] Frontend never calls Polymarket directly
- [ ] User credentials sent over HTTPS only
- [ ] CORS restricted to frontend origin
- [ ] Rate limiting enabled
- [ ] Nonce replay protection active
- [ ] No credentials logged

## Monitoring

The `/health/detailed` endpoint returns:
- Uptime
- Memory usage
- Cache hit rates
- Nonce store stats

Set up alerts for:
- Cache hit rate < 80%
- Memory usage > 500MB
- Request latency > 5s
- Error rate > 1%
