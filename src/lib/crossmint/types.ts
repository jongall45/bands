/**
 * Crossmint Onramp Types
 */

export type CrossmintOrderStatus = 'created' | 'pending' | 'completed' | 'failed'

export interface CrossmintOrder {
  orderId: string
  status: CrossmintOrderStatus
  walletAddress: string
  amountUsd: string
  createdAt: number
  updatedAt: number
}

export interface CreateOrderRequest {
  walletAddress: string
  amountUsd: string
  receiptEmail?: string
}

export interface CreateOrderResponse {
  orderId: string
  clientSecret: string
}

export interface OrderStatusResponse {
  orderId: string
  status: CrossmintOrderStatus
}

export interface CrossmintWebhookEvent {
  type: string
  data: {
    orderId: string
    status?: string
    [key: string]: unknown
  }
}

// Crossmint API response types
export interface CrossmintApiOrderResponse {
  orderId: string
  clientSecret: string
  status?: string
}
