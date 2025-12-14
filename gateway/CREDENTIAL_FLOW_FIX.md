# Polymarket Credential Flow Fix

## Problem Identified

The gateway was correctly using derived user credentials for order submission, but:
1. Builder headers were not being added to derive/create API calls (needed for attribution)
2. Logging didn't clearly show which credentials were being used
3. Error handling was converting 401/403 to 500

## Changes Made

### 1. Added `getOrDeriveClobCreds()` Function ✅
- **File**: `gateway/src/services/clobCreds.ts` (NEW)
- **Purpose**: Centralized function to get or derive user-scoped L2 API credentials
- **Behavior**:
  - Checks cache first (by checksum-lowercase address)
  - If not cached, derives using L1 auth + builder credentials (for attribution)
  - Stores derived credentials for 12 hours
  - Returns derived user credentials (NOT builder credentials)

### 2. Builder Headers Added to Derive/Create ✅
- **File**: `gateway/src/services/polymarketClient.ts`
- **Change**: `deriveOrCreateApiKey()` now includes builder headers in derive/create requests
- **Purpose**: Builder credentials are used for attribution during credential derivation, not for order submission

### 3. Explicit Credential Usage Logging ✅
- **File**: `gateway/src/services/polymarketClient.ts`
- **Change**: `makeRequest()` now logs `credType`:
  - `DERIVED_USER_CREDS` - Using derived user credentials (for orders)
  - `BUILDER_CREDS_ONLY` - Using builder credentials only (for attribution)
  - `NO_CREDS` - No credentials (public endpoints)

### 4. Improved Error Handling ✅
- **Files**: `gateway/src/routes/orders.ts`, `gateway/src/services/polymarketClient.ts`
- **Change**: 401/403 errors now return proper status codes (not converted to 500)
- **Change**: Error messages are sanitized to prevent secret leakage

### 5. All Order Operations Use Derived Creds ✅
- **POST /api/order**: Uses `getOrDeriveClobCreds()` → derived user creds
- **GET /api/orders**: Uses `getOrDeriveClobCreds()` → derived user creds
- **DELETE /api/order/:id**: Uses `getOrDeriveClobCreds()` → derived user creds

## Credential Flow

### First Order for a Wallet:
```
1. Browser sends L1 auth signature (EIP-712)
2. Gateway calls getOrDeriveClobCreds()
3. Cache miss → calls deriveOrCreateApiKey()
4. deriveOrCreateApiKey() includes builder headers (for attribution)
5. Polymarket returns L2 API credentials (apiKey, secret, passphrase)
6. Gateway stores L2 creds in cache (12h TTL)
7. Gateway uses L2 creds (NOT builder creds) to submit order
```

### Subsequent Orders (Same Wallet):
```
1. Browser sends L1 auth signature
2. Gateway calls getOrDeriveClobCreds()
3. Cache hit → returns cached L2 creds
4. Gateway uses cached L2 creds to submit order
```

## Expected Railway Logs

### On Startup:
```
[Config] Builder credentials: hasKey=true hasSecret=true hasPass=true keyLen=36 secretLen=44 passLen=44
[Config] CLOB API: https://clob.polymarket.com
```

### First Order (Derive Flow):
```
[Order] Getting/deriving user creds for wallet: 0xe557074E...
[Creds] Deriving new L2 API key for 0xe557074E... (first time for this wallet)
[Auth] Deriving L2 API key for wallet: 0xe557074E... hasSignature=true timestamp=... hasBuilderAttribution=true
[Auth] Attempting derive: https://clob.polymarket.com/auth/derive-api-key
[Auth] L2 API key derived successfully for 0xe557074E... keyLen=32 secretLen=44
[Creds] Successfully derived and cached creds for 0xe557074E... keyLen=32
[Order] Using DERIVED user creds (not builder creds) for order submission: keyLen=32
[Polymarket] POST clob.polymarket.com/order credType=DERIVED_USER_CREDS hasUserCreds=true hasBuilderCreds=true
[Auth] Using DERIVED user creds for request: keyLen=32 keyPrefix=abc12345...
[Order] Order submitted successfully using derived user creds
```

### Subsequent Orders (Cached):
```
[Order] Getting/deriving user creds for wallet: 0xe557074E...
[Creds] Using cached derived creds for 0xe557074E... keyLen=32
[Order] Using DERIVED user creds (not builder creds) for order submission: keyLen=32
[Polymarket] POST clob.polymarket.com/order credType=DERIVED_USER_CREDS hasUserCreds=true hasBuilderCreds=true
```

### If Auth Fails:
```
[Order] Order submission failed: status=401 error=Unauthorized/Invalid api key usingDerivedCreds=true
Order submission auth error: <orderId> owner=<address> status=401 error=Unauthorized/Invalid api key
```

## Test Checklist

### 1. Verify Credentials Are Loaded
After deploy, check Railway startup logs:
- ✅ Should see: `hasKey=true hasSecret=true hasPass=true`
- ✅ Should see: `keyLen`, `secretLen`, `passLen` > 0

### 2. Test First Order (Derive Flow)
1. Place a test order from a wallet that hasn't traded before
2. Check Railway logs for:
   - ✅ `[Creds] Deriving new L2 API key for ... (first time for this wallet)`
   - ✅ `[Auth] L2 API key derived successfully`
   - ✅ `[Order] Using DERIVED user creds (NOT builder creds)`
   - ✅ `credType=DERIVED_USER_CREDS`

### 3. Test Second Order (Cached)
1. Place another order from the same wallet
2. Check Railway logs for:
   - ✅ `[Creds] Using cached derived creds`
   - ✅ No derive API call
   - ✅ Order succeeds

### 4. Verify Order Success
- ✅ Order should return `201/200` with `orderId`
- ✅ Order should appear in `/api/orders` for that wallet
- ✅ No "Unauthorized/Invalid api key" errors

## Files Modified

1. `gateway/src/services/clobCreds.ts` - NEW: Centralized credential management
2. `gateway/src/services/polymarketClient.ts` - Added builder headers to derive, improved logging
3. `gateway/src/routes/orders.ts` - Use `getOrDeriveClobCreds()` for all operations
4. `gateway/src/services/userCredsStore.ts` - Improved logging

## Key Points

- **Builder credentials** are ONLY used for attribution during derive/create
- **Derived user credentials** are used for ALL order operations
- Credentials are cached per wallet (12h TTL)
- First order triggers derive, subsequent orders use cache
- All logs clearly show which credential type is being used
