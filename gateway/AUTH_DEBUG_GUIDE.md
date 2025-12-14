# Polymarket Gateway Auth Debugging Guide

## Environment Variables Required

**YES, you need to add Polymarket Builder API credentials to Railway:**

1. Go to Railway Dashboard → Your Gateway Service → Variables
2. Add these three environment variables:
   - `POLYMARKET_BUILDER_API_KEY` - Your Polymarket builder API key
   - `POLYMARKET_BUILDER_API_SECRET` - Your Polymarket builder API secret (base64)
   - `POLYMARKET_BUILDER_PASSPHRASE` - Your Polymarket builder passphrase

These are used for **builder attribution** (not for user authentication). User authentication uses L2 API keys derived from L1 wallet signatures.

## Changes Made

### 1. Environment Variable Handling ✅
- Added `.trim()` to all env vars to remove whitespace
- Added debug logging on startup showing credential presence and lengths

### 2. Debug Logging ✅
- Logs credential presence (hasKey/hasSecret/hasPass) on startup
- Logs credential lengths (keyLen/secretLen/passLen) - safe, no secrets exposed
- Logs CLOB API host being called
- Logs auth header presence for each request

### 3. Error Handling ✅
- 401/403 errors now return proper status codes (not converted to 500)
- Error messages are sanitized (removes potential secrets)
- Auth errors are properly logged with status codes

### 4. Health Check Endpoint ✅
- New endpoint: `GET /api/polymarket/health-auth`
- Tests authenticated request using builder credentials
- Returns detailed error info if auth fails

## Testing Checklist

### Step 1: Verify Environment Variables
After deploying, check Railway logs on startup. You should see:
```
[Config] Builder credentials: hasKey=true hasSecret=true hasPass=true keyLen=XX secretLen=XX passLen=XX
[Config] CLOB API: https://clob.polymarket.com
[Config] Gamma API: https://gamma-api.polymarket.com
```

**Expected:**
- `hasKey=true hasSecret=true hasPass=true`
- `keyLen`, `secretLen`, `passLen` should be > 0 (typically 20-50 chars)

**If missing:**
- Check Railway Variables tab
- Ensure variable names are exactly: `POLYMARKET_BUILDER_API_KEY`, `POLYMARKET_BUILDER_API_SECRET`, `POLYMARKET_BUILDER_PASSPHRASE`
- Redeploy after adding variables

### Step 2: Test Basic Connectivity
```bash
curl https://bands-production-1ac7.up.railway.app/health/polymarket
```

**Expected:** `{ "ok": true, "latencyMs": <number> }`

### Step 3: Test Authenticated Request
```bash
curl https://bands-production-1ac7.up.railway.app/api/polymarket/health-auth
```

**Expected (if creds are valid):**
```json
{
  "ok": true,
  "latencyMs": 234,
  "clobApi": "https://clob.polymarket.com",
  "hasBuilderCreds": true,
  "timestamp": "2025-12-14T..."
}
```

**Expected (if creds are missing/invalid):**
```json
{
  "ok": false,
  "error": "Unauthorized/Invalid api key",
  "status": 401,
  "message": "Invalid builder API credentials",
  "latencyMs": 123
}
```

### Step 4: Test Order Submission
1. Navigate to `/speculate/polymarket` in your app
2. Place a test order ($1 Buy)
3. Check browser Network tab - should see `POST https://bands-production-1ac7.up.railway.app/api/order`
4. Check Railway logs for:
   - `[Auth] User creds: keyLen=XX secretLen=XX passLen=XX`
   - `[Polymarket] POST https://clob.polymarket.com/order host=clob.polymarket.com ... hasUserCreds=true hasBuilderCreds=true`

**Expected:**
- Order should return `201` or `200` with `orderId`
- If auth fails, should return `401` or `403` (not `500`)

## Railway Logs to Look For

### On Startup (Good):
```
[Config] Builder credentials: hasKey=true hasSecret=true hasPass=true keyLen=32 secretLen=44 passLen=8
[Config] CLOB API: https://clob.polymarket.com
[Config] Gamma API: https://gamma-api.polymarket.com
🚀 Polymarket Gateway started on port 8080 (production)
```

### On Order Submission (Good):
```
[Auth] User creds: keyLen=32 secretLen=44 passLen=8
[Polymarket] POST https://clob.polymarket.com/order host=clob.polymarket.com path=/order hasBody=true hasUserCreds=true hasBuilderCreds=true
Polymarket API: POST /order 234ms success=true
```

### On Auth Failure:
```
[Polymarket] Error response: {"error":"Unauthorized/Invalid api key"} status=401 path=/order
Order submission auth error: <orderId> owner=<address> status=401 error=Unauthorized/Invalid api key
```

## Common Issues

### Issue: "Builder credentials not configured"
**Solution:** Add the three environment variables to Railway

### Issue: "Invalid api key" (401)
**Possible causes:**
1. Builder credentials are incorrect
2. Builder credentials have trailing whitespace (should be fixed by `.trim()`)
3. Builder credentials are for wrong environment (dev vs prod)

**Solution:**
1. Verify credentials in Railway Variables
2. Test with `/api/polymarket/health-auth` endpoint
3. Check Railway logs for credential lengths

### Issue: Order submission returns 500 instead of 401
**Solution:** Should be fixed - auth errors now return proper status codes

## Files Modified

1. `gateway/src/config/index.ts` - Added `.trim()` and debug logging
2. `gateway/src/services/polymarketClient.ts` - Added debug logs, improved error handling
3. `gateway/src/routes/orders.ts` - Improved error handling for auth errors
4. `gateway/src/routes/polymarket.ts` - New file with `/health-auth` endpoint
5. `gateway/src/index.ts` - Added polymarket routes
