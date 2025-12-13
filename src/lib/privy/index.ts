/**
 * Privy "Fomo-Style" No-Prompt Transaction System
 * 
 * Complete implementation for instant, gasless, prompt-free transactions.
 * 
 * @see docs/PRIVY_FOMO_SETUP.md for Dashboard configuration
 */

// Configuration
export {
  privyConfig,
  smartWalletConfig,
  SUPPORTED_CHAINS,
  DEFAULT_CHAIN,
  CHAIN_IDS,
  SILENT_UI_OPTIONS,
} from './config'

// Providers
export { PrivyProviders } from './providers'

// Preflight checks
export {
  runPreflight,
  quickPreflight,
  logAddresses,
  assertWalletReady,
  type PreflightResult,
  type PreflightCheck,
  type PreflightParams,
} from './preflight'

// Approval strategies
export {
  supportsPermit,
  buildPermitMessage,
  encodeApprove,
  encodeMaxApprove,
  createBatchedApprovalTx,
  ApprovalManager,
  approvalManager,
  PERMIT_SUPPORTED_TOKENS,
} from './approvals'
