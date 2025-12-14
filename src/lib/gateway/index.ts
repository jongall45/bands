/**
 * Gateway Module
 * 
 * This module provides a clean interface to the Polymarket Gateway service.
 * All Polymarket interactions MUST go through this module.
 * 
 * Architecture:
 * - Browser signs orders locally using ClobClient.createOrder()
 * - Browser sends signed order to Gateway
 * - Gateway submits to Polymarket with proper auth
 * - Browser never talks to Polymarket directly
 */

export * from './client.js'
