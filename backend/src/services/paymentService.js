import Stripe from "stripe";
import Reservation from "../models/Reservation.js";
import Listing from "../models/Listing.js";
import { notifyBusiness } from "./notificationService.js";

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
}

export function checkoutConfiguration() {
  getStripe();
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook is not configured");
  const success = new URL(process.env.STRIPE_SUCCESS_URL);
  const cancel = new URL(process.env.STRIPE_CANCEL_URL);
  for (const url of [success, cancel]) {
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) {
      throw new Error("Checkout return URLs must use HTTPS");
    }
  }
  return { success: success.toString(), cancel: cancel.toString() };
}

export function amountInCents(price, quantity) {
  if (typeof price !== "number" || price < 0 || price - price !== 0 ||
      !Number.isInteger(quantity) || quantity <= 0) return null;
  const formatted = price.toFixed(2);
  if (Number(formatted) !== price) return null;
  const cents = Number(formatted.replace(".", "")) * quantity;
  if (!Number.isInteger(cents) || cents > 99999999 || (cents > 0 && cents < 50)) return null;
  return cents;
}

export function paymentSummary(reservation) {
  return {
    payment_status: reservation.payment_status,
    amount_cents: reservation.amount_cents,
    currency: reservation.currency,
    payment_due_at: reservation.payment_due_at,
    paid_at: reservation.paid_at,
    refund_status: reservation.refund_status,
    stock_release_status: reservation.stock_release_status,
  };
}

export async function releaseStock(reservation) {
  const claimed = await Reservation.updatePayment({
    _id: reservation._id,
    status: { $in: ["CANCELLED", "EXPIRED"] },
    stock_release_status: "HELD",
  }, { stock_release_status: "RELEASING" });
  if (claimed.modifiedCount !== 1) return;
  let status = "REVIEW";
  try {
    // restoreStock returns true once the stock is back. Passing the reservation ID
    // stops the same reservation's stock being restored twice (for example by the cleanup sweep).
    const restored = await Listing.restoreStock(reservation.listing_id, reservation.quantity, reservation._id);
    if (restored) status = "RELEASED";
  } catch (error) {
    console.error("Stock release needs review for reservation", reservation._id.toString());
  }
  await Reservation.updatePayment({ _id: reservation._id, stock_release_status: "RELEASING" }, {
    stock_release_status: status,
  });
}

async function refundPayment(reservation, stripe) {
  if (reservation.refund_status === "SUCCEEDED" || reservation.refund_status === "REVIEW") return;
  if (!reservation.stripe_payment_intent_id) throw new Error("Paid reservation has no payment reference");
  await Reservation.updatePayment({ _id: reservation._id, refund_status: "NONE" }, {
    refund_status: "REQUESTED", refund_requested_at: new Date(),
  });
  const current = await Reservation.findReservationById(reservation._id);
  if (current.refund_status === "SUCCEEDED" || current.refund_status === "REVIEW") return;
  let refund;
  if (current.stripe_refund_id) {
    refund = await stripe.refunds.retrieve(current.stripe_refund_id);
  } else {
    if (!current.refund_requested_at || Number(new Date()) - Number(current.refund_requested_at) >= 23 * 3600000) {
      await Reservation.updatePayment({ _id: current._id, refund_status: "REQUESTED" }, { refund_status: "REVIEW" });
      return;
    }
    refund = await stripe.refunds.create({
      payment_intent: current.stripe_payment_intent_id,
      amount: current.amount_cents,
      metadata: { reservationId: current._id.toString() },
    }, { idempotencyKey: "refund-" + current._id.toString() });
  }
  const update = { stripe_refund_id: refund.id, refund_status: "PENDING" };
  if (refund.status === "succeeded") {
    update.refund_status = "SUCCEEDED";
    update.payment_status = "REFUNDED";
  } else if (refund.status === "failed" || refund.status === "canceled") {
    update.refund_status = "REVIEW";
  }
  await Reservation.updatePayment({
    _id: current._id, refund_status: { $in: ["REQUESTED", "PENDING"] },
  }, update);
}

export async function syncCheckout(session, stripe) {
  const id = session.metadata && session.metadata.reservationId;
  if (typeof id !== "string" || id.length !== 24) throw new Error("Invalid checkout reservation reference");
  for (const character of id) {
    if ("0123456789abcdef".indexOf(character) === -1) throw new Error("Invalid checkout reservation reference");
  }
  let reservation = await Reservation.findReservationById(id);
  if (!reservation || reservation.stripe_checkout_session_id !== session.id ||
      session.client_reference_id !== id || session.mode !== "payment" ||
      session.currency !== reservation.currency || session.amount_total !== reservation.amount_cents) {
    throw new Error("Checkout does not match reservation");
  }
  if (session.status === "complete" && session.payment_status === "paid") {
    if (typeof session.payment_intent !== "string") throw new Error("Missing payment intent");
    if (Number(reservation.expires_at) <= Number(new Date())) {
      await Reservation.updatePayment({ _id: reservation._id, status: "RESERVED", payment_status: "PENDING" }, {
        status: "EXPIRED", payment_status: "PAID", stripe_payment_intent_id: session.payment_intent, paid_at: new Date(),
      });
    }
  const result = await Reservation.updatePayment(
    {
      _id: reservation._id,
      status: "RESERVED",
      payment_status: "PENDING"
    },
    {
      payment_status: "PAID",
      stripe_payment_intent_id: session.payment_intent,
      paid_at: new Date()
    }
  );

  if (result.modifiedCount === 1) {
    await notifyBusiness(
      reservation,
      `New paid reservation received for ${reservation.listing_snapshot.title}`
    );
  }
  } else if (session.status === "expired") {
    await Reservation.updatePayment({ _id: reservation._id, payment_status: "PENDING" }, { payment_status: "FAILED" });
    await Reservation.updatePayment({ _id: reservation._id, status: "RESERVED", payment_status: "FAILED" }, {
      status: "EXPIRED",
    });
  }
  reservation = await Reservation.findReservationById(id);
  if ((reservation.status === "CANCELLED" || reservation.status === "EXPIRED") &&
      (reservation.payment_status === "PAID" || reservation.payment_status === "FAILED" ||
       reservation.payment_status === "REFUNDED")) {
    await releaseStock(reservation);
    if (reservation.payment_status === "PAID") await refundPayment(reservation, stripe);
  }
}

export async function ensureCheckout(reservation, stripe = getStripe()) {
  if (reservation.payment_status !== "PENDING") return null;
  let session;
  if (reservation.stripe_checkout_session_id) {
    session = await stripe.checkout.sessions.retrieve(reservation.stripe_checkout_session_id);
  } else {
    if (Number(new Date()) - Number(reservation.reserved_at) >= 23 * 3600000) {
      await Reservation.updatePayment({ _id: reservation._id, payment_status: "PENDING" }, { payment_status: "REVIEW" });
      throw new Error("Checkout creation needs manual reconciliation");
    }
    const id = reservation._id.toString();
    const success = new URL(reservation.checkout_success_url);
    const cancel = new URL(reservation.checkout_cancel_url);
    success.searchParams.set("reservationId", id);
    cancel.searchParams.set("reservationId", id);
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        adaptive_pricing: { enabled: false },
        client_reference_id: id,
        metadata: { reservationId: id },
        payment_intent_data: { metadata: { reservationId: id } },
        line_items: [{
          price_data: {
            currency: reservation.currency,
            unit_amount: reservation.amount_cents / reservation.quantity,
            product_data: { name: reservation.listing_snapshot.title },
          },
          quantity: reservation.quantity,
        }],
        success_url: success.toString(),
        cancel_url: cancel.toString(),
        expires_at: Number(reservation.payment_due_at) / 1000,
      }, { idempotencyKey: "checkout-" + id });
    } catch (error) {
      if (error.type === "StripeInvalidRequestError" && error.statusCode === 400 &&
          error.code !== "idempotency_key_in_use") {
        await Reservation.updatePayment({
          _id: reservation._id, payment_status: "PENDING", stripe_checkout_session_id: null,
        }, { status: "CANCELLED", payment_status: "FAILED", cancelled_at: new Date() });
        const current = await Reservation.findReservationById(reservation._id);
        if (current.payment_status === "FAILED") await releaseStock(current);
      }
      throw error;
    }
    await Reservation.updatePayment({ _id: reservation._id, stripe_checkout_session_id: null }, {
      stripe_checkout_session_id: session.id,
    });
  }
  const current = await Reservation.findReservationById(reservation._id);
  if (session.status === "open" && current.status !== "RESERVED") {
    try {
      session = await stripe.checkout.sessions.expire(session.id);
    } catch (error) {
      session = await stripe.checkout.sessions.retrieve(session.id);
      if (session.status === "open") throw error;
    }
  }
  await syncCheckout(session, stripe);
  return current.status === "RESERVED" && session.status === "open" ? session.url : null;
}

export async function reconcileReservation(reservation, stripe) {
  if (reservation.payment_status === "PENDING") {
    return ensureCheckout(reservation, stripe);
  }
  if (reservation.payment_status === "FAILED" && reservation.status === "RESERVED") {
    await Reservation.updatePayment({ _id: reservation._id, status: "RESERVED", payment_status: "FAILED" }, {
      status: "EXPIRED",
    });
    reservation = await Reservation.findReservationById(reservation._id);
  }
  if (reservation.status !== "CANCELLED" && reservation.status !== "EXPIRED") return null;
  if (reservation.payment_status === "PAID") {
    await releaseStock(reservation);
    await refundPayment(reservation, stripe || getStripe());
  } else if (reservation.payment_status === "NOT_REQUIRED" || reservation.payment_status === "FAILED" ||
             reservation.payment_status === "REFUNDED") {
    await releaseStock(reservation);
  }
  return null;
}

export async function syncRefund(refund) {
  const reservation = await Reservation.findByPaymentIntent(refund.payment_intent);
  if (!reservation) {
    if (refund.metadata && refund.metadata.reservationId) throw new Error("Refund payment has not been saved yet");
    return;
  }
  if (refund.currency !== reservation.currency) throw new Error("Refund currency mismatch");
  if (refund.status === "succeeded") {
    if (refund.amount !== reservation.amount_cents) {
      await Reservation.updatePayment({ _id: reservation._id, payment_status: "PAID" }, {
        payment_status: "REVIEW", refund_status: "REVIEW",
      });
      return;
    }
    await Reservation.updatePayment({ _id: reservation._id, status: "RESERVED" }, { status: "CANCELLED", cancelled_at: new Date() });
    await Reservation.updatePayment({ _id: reservation._id }, {
      payment_status: "REFUNDED", refund_status: "SUCCEEDED", stripe_refund_id: refund.id,
    });
    await releaseStock(await Reservation.findReservationById(reservation._id));
  } else if (refund.status === "failed" || refund.status === "canceled") {
    await Reservation.updatePayment({ _id: reservation._id, stripe_refund_id: refund.id, payment_status: "PAID" }, {
      refund_status: "REVIEW",
    });
  }
}

export async function reconcilePayments() {
  const reservations = await Reservation.findPaymentsToReconcile();
  for (const reservation of reservations) {
    try {
      await reconcileReservation(reservation);
    } catch (error) {
      console.error("Payment reconciliation pending for reservation", reservation._id.toString());
    }
  }
}

export function startPaymentReconciliation() {
  async function run() {
    try {
      if (process.env.STRIPE_SECRET_KEY) await reconcilePayments();
    } catch (error) {
      console.error("Payment reconciliation could not run");
    }
    const timer = setTimeout(run, 60000);
    timer.unref();
  }
  run();
}
