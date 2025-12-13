# Crossmint Onramp Integration

This document describes the Crossmint onramp backend implementation for purchasing USDC on Base.

## Overview

The Crossmint integration allows users to purchase USDC using credit/debit cards. Funds are delivered directly to the user's Privy smart wallet address on Base.

**Key Features:**
- Server-side order creation (API key never exposed to client)
- Webhook support for real-time status updates
- Polling endpoint for development/fallback
- USDC on Base only (configurable)

## Required Environment Variables

```bash
# Server-side API key (NEVER expose to client)
CROSSMINT_SERVER_SIDE_API_KEY=sk_staging_xxx

# Client-side API key (safe for frontend)
CROSSMINT_CLIENT_SIDE_API_KEY=ck_staging_xxx

# Webhook secret for signature verification
CROSSMINT_WEBHOOK_SECRET=whsec_xxx

# Environment: staging | production
CROSSMINT_ENV=staging

# Token locator (USDC on Base)
CROSSMINT_TOKEN_LOCATOR=base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
```

### Getting Credentials

1. Go to [Crossmint Console](https://console.crossmint.com)
2. Create a project or select existing one
3. Navigate to API Keys section
4. Create a server-side API key (starts with `sk_`)
5. Create a client-side API key (starts with `ck_`)
6. Set up a webhook endpoint and copy the secret

## API Endpoints

### POST /api/crossmint/create-order

Creates a new onramp order.

**Request:**
```json
{
  "walletAddress": "0x1234...abcd",
  "amountUsd": "50",
  "receiptEmail": "user@example.com"
}
```

**Response:**
```json
{
  "orderId": "order_xxx",
  "clientSecret": "cs_xxx"
}
```

**Validation:**
- `walletAddress`: Required, valid EVM address (0x + 40 hex chars)
- `amountUsd`: Required, positive number between $5 and $2000
- `receiptEmail`: Optional, for payment receipt

### POST /api/crossmint/webhook

Handles Crossmint webhook events for order status updates.

**Supported Events:**
- `order.completed` - Payment successful, funds delivered
- `order.failed` - Payment failed
- `order.pending` - Payment processing

**Security:**
- Signature verification using `CROSSMINT_WEBHOOK_SECRET`
- Returns 200 quickly to acknowledge receipt

### GET /api/crossmint/order-status

Poll for order status (useful when webhooks aren't available).

**Request:**
```
GET /api/crossmint/order-status?orderId=order_xxx
```

**Response:**
```json
{
  "orderId": "order_xxx",
  "status": "completed"
}
```

**Status Values:**
- `created` - Order created, awaiting payment
- `pending` - Payment processing
- `completed` - Payment successful
- `failed` - Payment failed

## Testing in Staging

### 1. Set Environment Variables

```bash
export CROSSMINT_ENV=staging
export CROSSMINT_SERVER_SIDE_API_KEY=sk_staging_xxx
export CROSSMINT_WEBHOOK_SECRET=whsec_xxx
```

### 2. Create a Test Order

```bash
curl -X POST http://localhost:3000/api/crossmint/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "amountUsd": "10",
    "receiptEmail": "test@example.com"
  }'
```

### 3. Check Order Status

```bash
curl "http://localhost:3000/api/crossmint/order-status?orderId=order_xxx"
```

### 4. Test Webhooks Locally

Use [ngrok](https://ngrok.com) or similar to expose your local server:

```bash
ngrok http 3000
```

Then configure the webhook URL in Crossmint Console:
```
https://your-ngrok-id.ngrok.io/api/crossmint/webhook
```

## Frontend Integration

The frontend should:

1. Call `/api/crossmint/create-order` with the smart wallet address
2. Use the returned `clientSecret` to initialize Crossmint's payment widget
3. Optionally poll `/api/crossmint/order-status` for status updates

**Important:** Funds must be delivered to the **Privy smart wallet address**, not the embedded EOA.

```typescript
// Example frontend usage
const response = await fetch('/api/crossmint/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: smartWalletAddress, // Privy smart wallet!
    amountUsd: '50',
  }),
})

const { orderId, clientSecret } = await response.json()

// Use clientSecret with Crossmint widget
```

## Production Checklist

- [ ] Set `CROSSMINT_ENV=production`
- [ ] Use production API keys (start with `sk_production_` / `ck_production_`)
- [ ] Configure production webhook URL in Crossmint Console
- [ ] Verify webhook secret is set correctly
- [ ] Test end-to-end flow with small amount
- [ ] Implement persistent storage (replace in-memory store)
- [ ] Add monitoring/alerting for failed orders

## Security Notes

1. **API Key Protection**: `CROSSMINT_SERVER_SIDE_API_KEY` must never be exposed to the client. All Crossmint API calls go through our backend.

2. **Webhook Verification**: All incoming webhooks are verified using HMAC-SHA256 signature before processing.

3. **Input Validation**: Wallet addresses and amounts are validated server-side.

4. **Rate Limiting**: Consider adding rate limiting to prevent abuse.

## Troubleshooting

### "Server configuration error"
- Check that all required environment variables are set
- Verify API key format (should start with `sk_staging_` or `sk_production_`)

### "Invalid signature" on webhooks
- Verify `CROSSMINT_WEBHOOK_SECRET` matches the one in Crossmint Console
- Ensure the webhook URL is correct

### Order stuck in "created" status
- Check webhook endpoint is accessible
- Verify webhook is configured in Crossmint Console
- Check server logs for webhook errors

### "Failed to create order"
- Verify Crossmint API key has correct permissions
- Check amount is within allowed range ($5-$2000)
- Verify token locator is correct for your Crossmint configuration
