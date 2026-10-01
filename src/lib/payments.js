// One place for wallet recharges. Swap the gateway with VITE_PAYMENT_MODE in .env.
import { supabase } from './supabase'
import { PAYMENT_MODE } from '../config/app'

/**
 * Step 1 — create a payment row in the database (price comes from wallet_packs).
 * Returns the payment row.
 */
export async function createOrder(packId) {
  const { data, error } = await supabase.rpc('create_payment_order', { p_pack_id: packId })
  if (error) throw error
  return data
}

/**
 * Step 2 — take the money.
 * dummy:    caller shows the test checkout, then calls confirmDummy().
 * razorpay: open Razorpay Checkout; the webhook Edge Function credits the wallet
 *           (see INTEGRATION.md). Nothing is credited from the browser.
 */
export async function startCheckout(order, { onSuccess, onFailure, profile }) {
  if (PAYMENT_MODE === 'dummy') return { needsDummyCheckout: true }

  if (PAYMENT_MODE === 'razorpay') {
    // TODO (Razorpay go-live) — outline:
    // 1. const { data } = await supabase.functions.invoke('razorpay-create-order', { body: { payment_id: order.id } })
    // 2. load https://checkout.razorpay.com/v1/checkout.js and open:
    //    new window.Razorpay({ key: import.meta.env.VITE_RAZORPAY_KEY_ID, order_id: data.razorpay_order_id,
    //      amount: data.amount_paise, currency: 'INR', name: 'Find My Schemes',
    //      prefill: { email: profile?.email, contact: profile?.mobile },
    //      handler: onSuccess, modal: { ondismiss: onFailure } }).open()
    // 3. wallet is credited by the 'razorpay-webhook' Edge Function → credit_payment()
    throw new Error('Razorpay is not connected yet. Set VITE_PAYMENT_MODE=dummy for testing.')
  }

  throw new Error(`Unknown payment mode: ${PAYMENT_MODE}`)
}

/** Test checkout only — the database refuses this once payment_mode is not 'dummy'. */
export async function confirmDummy(paymentId) {
  const { data, error } = await supabase.rpc('dummy_confirm_payment', { p_payment_id: paymentId })
  if (error) throw error
  return data
}
