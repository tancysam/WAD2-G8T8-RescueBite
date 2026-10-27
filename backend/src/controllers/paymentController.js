import Reservation from "../models/Reservation.js";
import { getStripe, ensureCheckout, syncCheckout, syncRefund, paymentSummary } from "../services/paymentService.js";

export async function resumeCheckout(req, res) {
  const id = req.body && req.body.reservationId;
  if (typeof id !== "string" || id.length !== 24) {
    return res.status(400).json({ error: "Invalid reservation ID" });
  }
  for (const character of id) {
    if ("0123456789abcdef".indexOf(character) === -1) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }
  }
  try {
    const reservation = await Reservation.findReservationById(id);
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    if (!req.user || reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not own this reservation" });
    }
    if (reservation.status !== "RESERVED" || reservation.payment_status !== "PENDING") {
      return res.status(409).json({ error: "Reservation is not awaiting payment" });
    }
    const checkoutUrl = await ensureCheckout(reservation);
    const current = await Reservation.findReservationById(id);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ reservationId: id, checkoutUrl, payment: paymentSummary(current) });
  } catch (error) {
    return res.status(503).json({ error: "Checkout is unavailable. Retry this reservation later", reservationId: id });
  }
}

export async function stripeWebhook(req, res) {
  let stripe;
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Payments are not configured" });
  }
  let event;
  try {
    stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).json({ error: "Invalid Stripe signature" });
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired" ||
        event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.async_payment_failed") {
      const object = event.data.object;
      if (object.metadata && object.metadata.reservationId) {
        const session = await stripe.checkout.sessions.retrieve(object.id);
        await syncCheckout(session, stripe);
      }
    }
    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      const refund = await stripe.refunds.retrieve(event.data.object.id);
      await syncRefund(refund);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe event processing requires retry", event.id);
    return res.status(503).json({ error: "Payment processing pending; retry event" });
  }
}
