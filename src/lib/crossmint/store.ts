/**
 * Crossmint Order Store
 * 
 * Simple in-memory store for tracking order status.
 * In production, replace with a proper database (Prisma, Drizzle, etc.)
 * 
 * Note: This store is ephemeral and will be cleared on server restart.
 * For production, implement persistent storage.
 */

import type { CrossmintOrder, CrossmintOrderStatus } from './types'

// In-memory store
const orders = new Map<string, CrossmintOrder>()

/**
 * Create a new order record
 */
export function createOrder(
  orderId: string,
  walletAddress: string,
  amountUsd: string
): CrossmintOrder {
  const now = Date.now()
  const order: CrossmintOrder = {
    orderId,
    status: 'created',
    walletAddress,
    amountUsd,
    createdAt: now,
    updatedAt: now,
  }
  orders.set(orderId, order)
  return order
}

/**
 * Get an order by ID
 */
export function getOrder(orderId: string): CrossmintOrder | undefined {
  return orders.get(orderId)
}

/**
 * Update order status
 */
export function updateOrderStatus(
  orderId: string,
  status: CrossmintOrderStatus
): CrossmintOrder | undefined {
  const order = orders.get(orderId)
  if (!order) {
    // Create a placeholder if order doesn't exist (webhook arrived before create response)
    const newOrder: CrossmintOrder = {
      orderId,
      status,
      walletAddress: '',
      amountUsd: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    orders.set(orderId, newOrder)
    return newOrder
  }
  
  order.status = status
  order.updatedAt = Date.now()
  orders.set(orderId, order)
  return order
}

/**
 * Get all orders (for debugging/admin)
 */
export function getAllOrders(): CrossmintOrder[] {
  return Array.from(orders.values())
}

/**
 * Clear all orders (for testing)
 */
export function clearOrders(): void {
  orders.clear()
}

/**
 * Get orders by wallet address
 */
export function getOrdersByWallet(walletAddress: string): CrossmintOrder[] {
  return Array.from(orders.values()).filter(
    order => order.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  )
}
