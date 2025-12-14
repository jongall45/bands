# Polymarket Gateway Architecture Fix

## Summary

Fixed the Polymarket trading integration to ensure **all CLOB requests go through the Railway gateway**, eliminating direct browser-to-Polymarket calls that were being blocked.

## Changes Made

### 1. Removed ClobClient from Frontend ✅
- **Problem**: `ClobClient.createOrder()` was making network requests to `localhost/tick-size`, causing `ERR_CONNECTION_REFUSED` errors
- **Solution**: Created manual order signing using EIP-712 (`src/lib/polymarket/manualOrderSigning.ts`)
- **Files Modified**:
  - `src/hooks/usePolymarketTrade.ts` - Removed ClobClient initialization and usage
  - `src/lib/polymarket/manualOrderSigning.ts` - New file for manual order creation/signing

### 2. Added Polymarket Health Check Endpoint ✅
- **New Endpoint**: `GET /health/polymarket` on gateway
- **Purpose**: Tests connectivity from Railway gateway → Polymarket CLOB API
- **Returns**: `{ ok: boolean, latencyMs?: number, error?: string }`
- **Files Modified**:
  - `gateway/src/routes/health.ts` - Added `/polymarket` route

### 3. Fixed Error Handling ✅
- **Problem**: UI was crashing with `Cannot read properties of undefined (reading 'toString')`
- **Solution**: Added safe error message extraction
- **Files Modified**:
  - `src/hooks/usePolymarketTrade.ts` - Improved error handling

### 4. Fixed Environment Variables ✅
- **Problem**: Hardcoded `localhost` references in production
- **Solution**: Removed localhost, use `NEXT_PUBLIC_GATEWAY_URL` environment variable
- **Files Modified**:
  - `src/lib/polymarket/client.ts` - Use `window.location.origin` instead of localhost
  - `src/lib/gateway/client.ts` - Ensure `https://` protocol is always present

### 5. Added Request Logging ✅
- **Gateway**: Logs outbound requests to Polymarket (host, method, path, status, error snippets)
- **Client**: Logs gateway requests and responses
- **Files Modified**:
  - `gateway/src/services/polymarketClient.ts` - Added request/response logging
  - `src/lib/gateway/client.ts` - Added console logging for debugging

## Architecture

### Before (Broken)
```
Browser → ClobClient.createOrder() → localhost/tick-size ❌ (ERR_CONNECTION_REFUSED)
Browser → Gateway → Polymarket ✅
```

### After (Fixed)
```
Browser → Manual EIP-712 Signing (no network calls) ✅
Browser → Gateway → Polymarket ✅
```

## Testing Checklist

### 1. Health Check
```bash
# Test gateway health
curl https://bands-production-1ac7.up.railway.app/health

# Test Polymarket connectivity from gateway
curl https://bands-production-1ac7.up.railway.app/health/polymarket
```

Expected: `{ ok: true, latencyMs: <number> }`

### 2. Place Test Order
1. Navigate to `/speculate/polymarket`
2. Select a market
3. Click "Buy YES" or "Buy NO" with $1
4. Check browser Network tab:
   - ✅ Request should go to `https://bands-production-1ac7.up.railway.app/api/order`
   - ❌ NO requests to `polymarket.com` or `localhost`
5. Check browser Console:
   - ✅ Should see `[Gateway] POST https://...` logs
   - ❌ NO `ERR_CONNECTION_REFUSED` or `localhost/tick-size` errors
   - ❌ NO `Cannot read properties of undefined` crashes

### 3. Verify Order Submission
- Order should appear in `/orders` endpoint
- Positions should update in `/positions` endpoint
- Gateway logs should show successful Polymarket submission

## Environment Variables

### Frontend (Vercel)
```
NEXT_PUBLIC_GATEWAY_URL=https://bands-production-1ac7.up.railway.app
```

### Gateway (Railway)
```
CLOB_API=https://clob.polymarket.com
GAMMA_API=https://gamma-api.polymarket.com
FRONTEND_ORIGIN=https://www.bands.cash
POLY_BUILDER_API_KEY=...
POLY_BUILDER_SECRET=...
POLY_BUILDER_PASSPHRASE=...
```

## Files Modified

1. `src/hooks/usePolymarketTrade.ts` - Removed ClobClient, use manual signing
2. `src/lib/polymarket/manualOrderSigning.ts` - New: Manual EIP-712 order signing
3. `src/lib/gateway/client.ts` - Fixed URL handling, added logging
4. `src/lib/polymarket/client.ts` - Removed localhost reference
5. `src/app/speculate/polymarket/page.tsx` - Removed debug logs
6. `gateway/src/routes/health.ts` - Added `/polymarket` health check
7. `gateway/src/services/polymarketClient.ts` - Added request logging

## Next Steps

1. Deploy to Vercel (frontend) and Railway (gateway)
2. Test health endpoints
3. Place test order and verify:
   - No localhost requests
   - No ClobClient network errors
   - Order successfully submitted
   - Gateway logs show successful Polymarket submission

## Troubleshooting

### If orders still fail:
1. Check gateway logs for Polymarket API errors
2. Verify `NEXT_PUBLIC_GATEWAY_URL` is set correctly in Vercel
3. Test `/health/polymarket` endpoint to verify gateway → Polymarket connectivity
4. Check browser console for gateway request/response logs

### If EIP-712 signing fails:
- Verify the order structure matches gateway expectations
- Check that `verifyingContract` address is correct (0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E)
- Ensure signer is the EOA (not Safe) for L1 auth
