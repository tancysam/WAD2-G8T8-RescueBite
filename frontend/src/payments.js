// Shared helpers for Stripe Checkout payments.
// Payment itself happens on Stripe's own checkout page; the backend creates
// that page and returns its address as checkoutUrl.

// A one-off key the backend uses to recognise a retried reservation request,
// so pressing Reserve again after a network error does not book twice.
export function newCheckoutRequestId() {
  return 'rb-' + Number(new Date()).toString() + '-' + Math.random().toString().substring(2, 12)
}

// Reservations from a backend without payments have no payment object
export function paymentStatusOf(reservation) {
  if (!reservation || !reservation.payment) return ''
  return reservation.payment.payment_status || ''
}

export function needsPayment(reservation) {
  return reservation.status === 'RESERVED' && paymentStatusOf(reservation) === 'PENDING'
}

// Collection is allowed once paid, or when the order was free
export function canCollect(reservation) {
  const status = paymentStatusOf(reservation)
  return status === '' || status === 'PAID' || status === 'NOT_REQUIRED'
}

export function paymentAmount(reservation) {
  if (!reservation || !reservation.payment) return ''
  const cents = reservation.payment.amount_cents
  if (!(cents >= 0)) return ''
  return 'S$' + (cents / 100).toFixed(2)
}

// Short label and tag colour for a reservation's payment
export function paymentLabel(reservation) {
  const status = paymentStatusOf(reservation)
  const refund = reservation.payment ? reservation.payment.refund_status : ''

  if (status === 'PAID' && (refund === 'REQUESTED' || refund === 'PENDING')) return { text: 'Refund pending', tone: 'expired' }
  if (status === 'PAID') return { text: 'Paid', tone: 'collected' }
  if (status === 'PENDING' && reservation.status === 'RESERVED') return { text: 'Awaiting payment', tone: 'reserved' }
  if (status === 'PENDING') return { text: 'Not paid', tone: '' }
  if (status === 'REFUNDED') return { text: 'Refunded', tone: 'expired' }
  if (status === 'FAILED') return { text: 'Payment failed', tone: '' }
  if (status === 'REVIEW') return { text: 'Payment under review', tone: '' }
  if (status === 'NOT_REQUIRED') return { text: 'Free', tone: '' }
  return null
}
