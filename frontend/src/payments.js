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

function bundleBlocked(reservation) {
  const pair = reservation.bundle_pair_status
  return pair === 'FORMING' || pair === 'VOID'
}

export function needsPayment(reservation) {
  return reservation.status === 'RESERVED' && paymentStatusOf(reservation) === 'PENDING' && !bundleBlocked(reservation)
}

function isPaidOrFree(reservation) {
  const status = paymentStatusOf(reservation)
  return status === '' || status === 'PAID' || status === 'NOT_REQUIRED'
}

export function canCollect(reservation, allReservations) {
  if (bundleBlocked(reservation)) return false
  if (!isPaidOrFree(reservation)) return false
  return !bundlePartnerUnpaid(reservation, allReservations)
}

function bundlePartnerUnpaid(reservation, allReservations) {
  if (!reservation.bundle_pair_status || !Array.isArray(allReservations)) return false
  const partner = allReservations.find(function (other) {
    return (
      other.bundle_group_id === reservation.bundle_group_id &&
      other._id !== reservation._id &&
      other.bundle_pair_status
    )
  })
  return !!partner && partner.status === 'RESERVED' && !isPaidOrFree(partner)
}

export function bundleNote(reservation, allReservations) {
  if (reservation.status !== 'RESERVED' || !reservation.bundle_pair_status) return ''
  if (reservation.bundle_pair_status === 'FORMING') {
    return 'We are still confirming this bundle. Payment and pickup open once both items are held.'
  }
  if (reservation.bundle_pair_status === 'VOID') {
    return 'This bundle is being cancelled because the other item is no longer available.'
  }
  if (isPaidOrFree(reservation) && bundlePartnerUnpaid(reservation, allReservations)) {
    return 'Pay for the other item in this bundle to unlock pickup for both.'
  }
  return ''
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

  if (status === 'PAID' && refund === 'REVIEW') return { text: 'Payment under review', tone: '' }
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
