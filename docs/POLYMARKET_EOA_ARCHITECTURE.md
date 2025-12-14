# Polymarket EOA-Only Trading Architecture

## Overview

This document describes the refactored Polymarket integration that uses Privy embedded EOA (Externally Owned Account) as the sole trading wallet. This replaces the previous Safe-based trading approach that was causing credential derivation failures.

## Architecture

### Trading Wallet

```
tradingWallet = Privy embedded EOA address
```

- **No Safe wallet** is involved in trading
- The EOA signs all orders directly
- Funds must be in the EOA on Polygon (native USDC)

### Signature Type

```
signatureType = 0 (EOA)
```

The order schema uses `signatureType: 0` indicating a standard EOA signature:
- `maker = tradingWallet` (EOA)
- `signer = tradingWallet` (EOA)
- `maker === signer` (must be the same address)

### Credential Derivation Flow

1. **Enable Trading** (frontend)
   - User clicks "Enable Trading" button
   - Frontend requests auth challenge from gateway
   - Gateway returns EIP-712 typed data for signing

2. **L1 Auth Signature** (frontend)
   - User signs the challenge with Privy embedded EOA
   - Signature sent to gateway with timestamp and nonce

3. **Derive Credentials** (gateway)
   - Gateway calls Polymarket `derive-api-key` endpoint
   - If no existing creds, calls `api-key` (create)
   - Stores credentials in cache (keyed by wallet address)

4. **Order Submission** (gateway)
   - Uses cached user credentials (NOT builder creds)
   - Validates `hasUserCreds === true` before submitting
   - Returns 401 if no credentials found

## Key Components

### Frontend

#### `usePolymarketTrade` Hook
- `tradingWallet`: Privy embedded EOA address
- `hasUserCreds`: Whether gateway has derived credentials
- `enableTrading()`: Initiates L1 auth and credential derivation
- `executeTrade()`: Signs and submits orders

#### `PolymarketTradingPanel` Component
- Shows "Enable Trading" button if no credentials
- Displays trading wallet address
- Shows USDC balance from trading wallet (EOA)

#### `createAndSignOrder` Function
- Sets `signatureType = 0` (EOA)
- Uses `tradingWallet` for both `maker` and `signer`
- Signs with EIP-712 typed data

### Gateway

#### `/api/polymarket/auth-challenge` (GET)
- Returns EIP-712 typed data for L1 auth
- Includes timestamp and nonce for replay protection

#### `/api/polymarket/auth/complete` (POST)
- Receives signed challenge
- Derives L2 API credentials
- Stores in cache

#### `/api/polymarket/auth/status` (GET)
- Returns whether wallet has cached credentials

#### `/api/polymarket/health` (GET)
- Checks gateway health
- Reports builder creds status
- Reports user creds status (if wallet provided)

#### `/api/order` (POST)
- Validates order schema (maker === signer === owner)
- Validates `signatureType === 0` for EOA
- Uses cached user credentials (or derives if l1Auth provided)
- Returns 401 if no credentials

## Session Storage

```typescript
interface TradingSession {
  tradingWallet: string  // EOA address
  hasUserCreds: boolean  // Whether gateway has derived credentials
  approvalsSet: boolean  // Whether USDC approvals are set
  createdAt: number      // Session creation timestamp
}
```

Stored in localStorage with key `polymarket_eoa_session`.

## Logging

Structured logging for trading operations:
- `auth_challenge`: When challenge is requested
- `auth_complete`: When auth is completed (success/failure)
- `cred_derive`: When credentials are derived
- `order_submit`: When order is submitted
- `order_result`: Order result (success/failure)

Logs include:
- `wallet`: First 10 chars of address
- `hasUserCreds`: Boolean
- `credTypeUsed`: USER | BUILDER | NONE
- `signatureType`: 0 for EOA
- `statusCode`: HTTP status
- `error`: Error message (if any)

## Balance Requirements

- USDC must be in the trading wallet (EOA) on Polygon
- Use the funding modal to bridge from other chains
- Smart Wallet USDC is **not** used for trading

## Error Handling

### USER_AUTH_REQUIRED (401)
- User hasn't enabled trading
- Credentials expired or invalid
- Solution: Click "Enable Trading" button

### Maker/Signer Mismatch (400)
- Order was created with different maker/signer
- Solution: Ensure `maker === signer === tradingWallet`

### Insufficient Balance
- Not enough USDC in trading wallet
- Solution: Bridge USDC to trading wallet on Polygon

## Migration from Safe Architecture

The codebase migrates from Safe-based trading:
- Legacy session keys are handled for backwards compatibility
- Safe-related fields are deprecated but still parsed
- New sessions use EOA-only format

## Testing Checklist

- [ ] User can sign L1 auth with Privy embedded EOA
- [ ] Gateway derives user creds successfully (no 401)
- [ ] Order has `signatureType: 0`
- [ ] Order has `maker === signer === tradingWallet`
- [ ] Order submission returns success
- [ ] Order is visible in Polymarket order history
- [ ] No Safe wallet is required for order execution
