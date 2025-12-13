# Privy "Fomo-Style" No-Prompt Setup Guide

## 1. Privy Dashboard Configuration Checklist

### Step 1: Enable Embedded Wallets
1. Go to **Privy Dashboard** → **Embedded wallets** → **Configuration**
2. Toggle **"Create embedded wallets for users"** to **ON**
3. Set **"Wallet type"** to **"Ethereum"**
4. Under **"Wallet creation"**, select **"Create on login"**

### Step 2: Disable Confirmation Modals (CRITICAL)
1. Go to **Privy Dashboard** → **Embedded wallets** → **Customization**
2. Find **"Require user confirmation for transactions"**
3. Toggle it to **OFF** (this is the key setting!)
4. Note: `noPromptOnSignature` in code is **DEPRECATED** - use dashboard toggle instead

### Step 3: Enable Smart Wallets
1. Go to **Privy Dashboard** → **Embedded wallets** → **Smart wallets**
2. Toggle **"Enable smart wallets"** to **ON**
3. Select supported chains: **Arbitrum, Base, Polygon** (or your chains)

### Step 4: Configure Gas Sponsorship
1. Go to **Privy Dashboard** → **Embedded wallets** → **Gas sponsorship**
2. Toggle **"Enable gas sponsorship"** to **ON**
3. Select chains to sponsor: **Arbitrum, Base, Polygon**
4. Set spending limits (recommended: start with $10/user/day)
5. Privy uses their built-in paymaster - no external URL needed for basic sponsorship

### Step 5: Whitelabel Wallet UI (Optional)
1. Go to **Privy Dashboard** → **Branding**
2. Upload your logo
3. Set primary color to match your app
4. This affects any UI that does show (login, etc.)

---

## Key Dashboard Settings Summary

| Setting | Location | Value |
|---------|----------|-------|
| Create wallets on login | Embedded wallets → Configuration | ON |
| Require confirmation | Embedded wallets → Customization | **OFF** |
| Smart wallets | Embedded wallets → Smart wallets | ON |
| Gas sponsorship | Embedded wallets → Gas sponsorship | ON + select chains |

---

## ⚠️ Deprecated Config Warning

**DO NOT USE** in your code:
```typescript
// ❌ DEPRECATED - will be ignored
embeddedWallets: {
  noPromptOnSignature: true, // This does nothing now!
}
```

**USE INSTEAD**: Dashboard toggle "Require user confirmation for transactions" = OFF

---

## Security Notes

1. **Disabling confirmations** means users won't see transaction details before signing
2. This is appropriate for:
   - Apps where you control all transaction flows
   - Gasless/sponsored transactions
   - Mobile-first "instant" UX
3. **NOT appropriate** for:
   - General-purpose wallets
   - Arbitrary dApp connections
   - High-value transactions without app-level confirmation

Your app should still show users what they're buying/doing in your own UI before calling the transaction.
