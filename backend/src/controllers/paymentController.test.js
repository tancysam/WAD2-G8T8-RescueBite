import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Listing from "../models/Listing.js";
import Business from "../models/Business.js";
import { resumeCheckout, stripeWebhook } from "./paymentController.js";
import { createReservation, cancelReservation, getReservationById } from "./reservationController.js";
import { getCollectionCode, verifyCollectionCode } from "./collectionController.js";

const id = "123456789012345678901234";
const listingId = "223456789012345678901234";
const businessId = "323456789012345678901234";
const consumerId = "423456789012345678901234";
const stripe = new Stripe("sk_test_local_dummy");
const sessionsPrototype = Object.getPrototypeOf(stripe.checkout.sessions);
const refundsPrototype = Object.getPrototypeOf(stripe.refunds);
const secret = "whsec_local_test_only";

function response() {
  return {
    code: 200, headers: {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

function matches(row, filter) {
  for (const [key, value] of Object.entries(filter)) {
    const actual = key.split('.').reduce((item, field) => item?.[field], row);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.$in && !value.$in.includes(actual)) return false;
      if (value.$gte && !(actual >= value.$gte)) return false;
      if (value.$lte && !(actual <= value.$lte)) return false;
    } else if (actual !== value) return false;
  }
  return true;
}

function setup(t) {
  const configuration = {
    STRIPE_SECRET_KEY: "sk_test_local_dummy",
    STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_SUCCESS_URL: "http://localhost:5173/payment/success",
    STRIPE_CANCEL_URL: "http://localhost:5173/payment/cancelled",
  };
  for (const [key, value] of Object.entries(configuration)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const row = {
    _id: id, consumer_user_id: consumerId, listing_id: listingId, quantity: 2,
    status: "RESERVED", payment_status: "PENDING", amount_cents: 500, currency: "sgd",
    stripe_checkout_session_id: "cs_test", stripe_payment_intent_id: null,
    stock_release_status: "HELD", refund_status: "NONE", collection_code: "a".repeat(64),
    expires_at: new Date(Date.now() + 7200000), reserved_at: new Date(),
    payment_due_at: new Date((Math.floor(Date.now() / 1000) + 1860) * 1000),
    checkout_success_url: configuration.STRIPE_SUCCESS_URL, checkout_cancel_url: configuration.STRIPE_CANCEL_URL,
    listing_snapshot: {
      title: "Food", business_id: businessId, business_name: "Bakery", pickup_address: "Pickup address",
      original_unit_price_sgd: 5, rescue_unit_price_sgd: 2.5,
      collection_start_at: new Date(Date.now() - 60000), collection_end_at: new Date(Date.now() + 7200000),
    },
  };
  const session = {
    id: "cs_test", mode: "payment", status: "open", payment_status: "unpaid",
    amount_total: 500, currency: "sgd", payment_intent: null,
    metadata: { reservationId: id }, client_reference_id: id,
    url: "https://checkout.stripe.com/test",
  };
  const listing = {
    _id: listingId, business_id: businessId, title: "Food", status: "ACTIVE", quantity_available: 5,
    original_price_sgd: 5, rescue_price_sgd: 2.5,
    collection_start_at: row.listing_snapshot.collection_start_at, collection_end_at: row.expires_at,
  };
  const business = { _id: businessId, status: "ACTIVE", name: "Bakery", address: "Pickup address", owner_user_id: "seller" };
  const update = t.mock.method(Reservation, "updatePayment", async (filter, fields) => {
    if (!matches(row, filter)) return { modifiedCount: 0, matchedCount: 0 };
    Object.assign(row, fields);
    return { modifiedCount: 1, matchedCount: 1 };
  });
  t.mock.method(Reservation, "findReservationById", async () => ({ ...row }));
  t.mock.method(Reservation, "findByPaymentIntent", async () => ({ ...row }));
  t.mock.method(Reservation, "findByCheckoutRequest", async () => null);
  const create = t.mock.method(Reservation, "createReservation", async data => { Object.assign(row, data); row.stripe_checkout_session_id = null; return { ...row }; });
  t.mock.method(Reservation, "cancelReservation", async (reservationId, userId) => {
    if (row.status !== "RESERVED" || row.consumer_user_id !== userId || row.expires_at <= new Date()) return { modifiedCount: 0 };
    row.status = "CANCELLED";
    return { modifiedCount: 1 };
  });
  t.mock.method(Listing, "findListingById", async () => listing);
  const reduce = t.mock.method(Listing, "reduceStock", async () => ({ modifiedCount: 1 }));
  const restore = t.mock.method(Listing, "restoreStock", async () => ({ modifiedCount: 1 }));
  t.mock.method(Business, "findBusinessById", async () => business);
  const checkout = t.mock.method(sessionsPrototype, "create", async () => ({ ...session }));
  const retrieve = t.mock.method(sessionsPrototype, "retrieve", async () => ({ ...session }));
  t.mock.method(sessionsPrototype, "expire", async () => { session.status = "expired"; return { ...session }; });
  const refund = t.mock.method(refundsPrototype, "create", async () => ({ id: "re_test", status: "succeeded" }));
  t.mock.method(refundsPrototype, "retrieve", async () => ({ id: "re_test", status: "succeeded", payment_intent: "pi_test", currency: "sgd", amount: 500 }));
  return { row, session, listing, business, create, update, reduce, restore, checkout, retrieve, refund };
}

function request(body = {}) {
  return { user: { _id: consumerId, role: "CONSUMER" }, params: { listingId, reservationId: id }, query: { reservationId: id }, body };
}

async function webhookServer(t) {
  const app = express();
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (event, signatureOptions = {}) => {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, ...signatureOptions });
    return fetch(`http://127.0.0.1:${server.address().port}/api/webhooks/stripe`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload,
    });
  };
}

function eventFor(session, type = 'checkout.session.completed') {
  return { id: 'evt_local_test', object: 'event', type, data: { object: session } };
}

test("production webhook is registered before JSON parsing and Clerk", async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const mount = source.indexOf('server.post("/api/webhooks/stripe", express.raw');
  assert.ok(mount >= 0);
  assert.ok(mount < source.indexOf('server.use(express.json())'));
  assert.ok(mount < source.indexOf('server.use("/api", clerkMiddleware())'));
});

test("HTTP webhook accepts real SDK signatures and handles duplicate paid delivery", async t => {
  const f = setup(t);
  f.session.status = 'complete'; f.session.payment_status = 'paid'; f.session.payment_intent = 'pi_test';
  const post = await webhookServer(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await post(eventFor(f.session));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { received: true });
  }
  assert.equal(f.row.payment_status, 'PAID');
  assert.equal(f.restore.mock.callCount(), 0);
  assert.equal(f.refund.mock.callCount(), 0);
});

test("HTTP webhook rejects forged and stale signatures without touching Stripe or the DB", async t => {
  const f = setup(t);
  const post = await webhookServer(t);
  assert.equal((await post(eventFor(f.session), { secret: 'wrong' })).status, 400);
  assert.equal((await post(eventFor(f.session), { timestamp: 1 })).status, 400);
  assert.equal(f.retrieve.mock.callCount(), 0);
  assert.equal(f.update.mock.callCount(), 0);
});

test("HTTP webhook uses authoritative Stripe data, not a claimed paid status", async t => {
  const f = setup(t);
  const post = await webhookServer(t);
  const result = await post(eventFor({ ...f.session, status: 'complete', payment_status: 'paid' }));
  assert.equal(result.status, 200);
  assert.equal(f.row.payment_status, 'PENDING');
});

test("HTTP webhook retries amount mismatches and storage failures", async t => {
  const f = setup(t);
  const post = await webhookServer(t);
  f.session.amount_total = 1;
  assert.equal((await post(eventFor(f.session))).status, 503);
  f.session.amount_total = 500;
  t.mock.method(Reservation, 'findReservationById', async () => { throw new Error('database unavailable'); });
  assert.equal((await post(eventFor(f.session))).status, 503);
});

test("HTTP refund notification cancels and replenishes only once", async t => {
  const f = setup(t);
  f.row.payment_status = 'PAID'; f.row.stripe_payment_intent_id = 'pi_test';
  const post = await webhookServer(t);
  for (let i = 0; i < 2; i++) assert.equal((await post(eventFor({ id: 're_test' }, 'refund.updated'))).status, 200);
  assert.equal(f.row.payment_status, 'REFUNDED');
  assert.equal(f.row.status, 'CANCELLED');
  assert.equal(f.restore.mock.callCount(), 1);
});

test("reservation creation uses server prices and hosted Stripe checkout", async t => {
  const f = setup(t);
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123', amount_cents: 1, payment_status: 'PAID' }), res);
  assert.equal(res.code, 201);
  assert.equal(res.body.checkoutUrl, f.session.url);
  assert.equal(f.row.amount_cents, 500);
  assert.equal(f.row.payment_status, 'PENDING');
  const [params, options] = f.checkout.mock.calls[0].arguments;
  assert.equal(params.line_items[0].price_data.unit_amount, 250);
  assert.equal(params.line_items[0].quantity, 2);
  assert.deepEqual(params.payment_method_types, ['card']);
  assert.equal(params.mode, 'payment');
  assert.equal(options.idempotencyKey, 'checkout-' + id);
  assert.ok(params.success_url.includes('reservationId=' + id));
  assert.ok(Number.isInteger(params.expires_at));
  assert.equal(JSON.stringify(res.body).includes(f.row.collection_code), false);
});

test("same reservation retry key never decrements stock again", async t => {
  const f = setup(t);
  t.mock.method(Reservation, 'findByCheckoutRequest', async () => ({ ...f.row }));
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), res);
  assert.equal(res.code, 200);
  assert.equal(f.reduce.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
  const conflict = response();
  await createReservation(request({ quantity: 3, checkoutRequestId: 'unique-request-123' }), conflict);
  assert.equal(conflict.code, 409);
});

test("free food skips Stripe and uses NOT_REQUIRED rather than claiming a payment", async t => {
  const f = setup(t); f.listing.rescue_price_sgd = 0;
  delete process.env.STRIPE_SECRET_KEY;
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), res);
  assert.equal(res.code, 201);
  assert.equal(res.body.checkoutUrl, null);
  assert.equal(f.row.payment_status, 'NOT_REQUIRED');
  assert.equal(f.checkout.mock.callCount(), 0);
});

test("missing config and short pickup window fail before stock is held", async t => {
  const f = setup(t);
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), res);
  assert.equal(res.code, 503);
  f.listing.collection_end_at = new Date(Date.now() + 60000);
  const short = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), short);
  assert.equal(short.code, 409);
  assert.equal(f.reduce.mock.callCount(), 0);
});

test("ambiguous Stripe creation retains stock and returns a reservation retry reference", async t => {
  const f = setup(t);
  t.mock.method(sessionsPrototype, 'create', async () => { throw new Error('Network timeout'); });
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.reservationId, id);
  assert.equal(f.row.payment_status, 'PENDING');
  assert.equal(f.restore.mock.callCount(), 0);
});

test("resume checkout requires ownership and awaiting-payment state", async t => {
  const f = setup(t);
  const req = request({ reservationId: id }); req.user._id = 'another-user';
  const denied = response(); await resumeCheckout(req, denied); assert.equal(denied.code, 403);
  const resumed = response(); await resumeCheckout(request({ reservationId: id }), resumed);
  assert.equal(resumed.code, 200); assert.equal(resumed.body.checkoutUrl, f.session.url);
  f.row.payment_status = 'PAID';
  const paid = response(); await resumeCheckout(request({ reservationId: id }), paid); assert.equal(paid.code, 409);
});

test("unpaid, refunded, and legacy reservations cannot expose collection codes", async t => {
  const f = setup(t);
  for (const state of ['PENDING', 'UNPAID', 'REFUNDED', 'REVIEW', undefined]) {
    f.row.payment_status = state;
    const res = response(); await getCollectionCode(request(), res);
    assert.equal(res.code, 409);
    assert.equal(res.body.collectionCode, undefined);
  }
  for (const state of ['PAID', 'NOT_REQUIRED']) {
    f.row.payment_status = state;
    const res = response(); await getCollectionCode(request(), res);
    assert.equal(res.code, 200);
    assert.equal(res.body.collectionCode, id + ':' + f.row.collection_code);
  }
});

test("business verification refuses unpaid collection before any write", async t => {
  const f = setup(t);
  const collected = t.mock.method(Reservation, 'markCollected', async () => ({ modifiedCount: 1, matchedCount: 1 }));
  const req = request({ businessId, collectionCode: id + ':' + f.row.collection_code });
  req.user = { _id: 'seller', role: 'BUSINESS' };
  const denied = response(); await verifyCollectionCode(req, denied); assert.equal(denied.code, 409);
  assert.equal(collected.mock.callCount(), 0);
  f.row.payment_status = 'PAID';
  const accepted = response(); await verifyCollectionCode(req, accepted); assert.equal(accepted.code, 200);
});

test("model enforces payment in the atomic collection filter", async t => {
  const model = mongoose.model('Reservation');
  const update = t.mock.method(model, 'updateOne', async () => ({ modifiedCount: 0 }));
  await Reservation.markCollected(id, 'code', businessId, 'seller');
  assert.deepEqual(update.mock.calls[0].arguments[0].payment_status, { $in: ['PAID', 'NOT_REQUIRED'] });
});

test("paid cancellation refunds once and repeated cancellation does not restore twice", async t => {
  const f = setup(t); f.row.payment_status = 'PAID'; f.row.stripe_payment_intent_id = 'pi_test';
  for (let i = 0; i < 2; i++) {
    const res = response(); await cancelReservation(request(), res); assert.equal(res.code, 200);
  }
  assert.equal(f.row.status, 'CANCELLED');
  assert.equal(f.row.payment_status, 'REFUNDED');
  assert.equal(f.restore.mock.callCount(), 1);
  assert.equal(f.refund.mock.callCount(), 1);
});

test("cancellation cannot affect another consumer or a collected booking", async t => {
  const f = setup(t);
  const req = request(); req.user._id = 'other';
  const denied = response(); await cancelReservation(req, denied); assert.equal(denied.code, 403);
  f.row.status = 'COLLECTED';
  const collected = response(); await cancelReservation(request(), collected); assert.equal(collected.code, 409);
  assert.equal(f.restore.mock.callCount(), 0);
  assert.equal(f.refund.mock.callCount(), 0);
});

test("reservation detail includes payment state but not collection secrets", async t => {
  const f = setup(t); const res = response();
  await getReservationById(request(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.reservation.payment.payment_status, 'PENDING');
  assert.equal(JSON.stringify(res.body).includes(f.row.collection_code), false);
});

test("definitive Stripe parameter rejection cancels and releases its hold", async t => {
  const f = setup(t);
  t.mock.method(sessionsPrototype, 'create', async () => {
    throw Object.assign(new Error('Invalid parameter'), { type: 'StripeInvalidRequestError', statusCode: 400 });
  });
  const res = response();
  await createReservation(request({ quantity: 2, checkoutRequestId: 'unique-request-123' }), res);
  assert.equal(res.code, 503);
  assert.equal(f.row.payment_status, 'FAILED');
  assert.equal(f.row.status, 'CANCELLED');
  assert.equal(f.restore.mock.callCount(), 1);
});

test("refund network failure is persisted for retry without restoring stock twice", async t => {
  const f = setup(t); f.row.payment_status = 'PAID'; f.row.stripe_payment_intent_id = 'pi_test';
  let attempts = 0;
  t.mock.method(refundsPrototype, 'create', async (params, options) => {
    assert.equal(options.idempotencyKey, 'refund-' + id);
    if (++attempts === 1) throw new Error('Network timeout');
    return { id: 're_test', status: 'succeeded' };
  });
  const first = response(); await cancelReservation(request(), first);
  assert.equal(first.code, 200);
  assert.equal(f.row.refund_status, 'REQUESTED');
  assert.ok(f.row.refund_requested_at instanceof Date);
  const retry = response(); await cancelReservation(request(), retry);
  assert.equal(retry.code, 200);
  assert.equal(f.row.payment_status, 'REFUNDED');
  assert.equal(f.restore.mock.callCount(), 1);
});

test("a paid session first confirmed after pickup expiry is refunded", async t => {
  const f = setup(t);
  f.row.expires_at = new Date(Date.now() - 1000);
  f.session.status = 'complete'; f.session.payment_status = 'paid'; f.session.payment_intent = 'pi_test';
  const post = await webhookServer(t);
  assert.equal((await post(eventFor(f.session))).status, 200);
  assert.equal(f.row.status, 'EXPIRED');
  assert.equal(f.row.payment_status, 'REFUNDED');
  assert.equal(f.refund.mock.callCount(), 1);
});
