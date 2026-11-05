import Reservation from "../models/Reservation.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import { getListingThumbnailUrl } from "./listingImageController.js";
import { amountInCents, checkoutConfiguration, ensureCheckout, paymentSummary, reconcileReservation } from "../services/paymentService.js";
import { notify, notifyBusiness } from "../services/notificationService.js";
import {
  closePair, completePair, isPairedLeg, loadPartner, pairStatus, sortLegs,
} from "../services/bundleService.js";


function distanceInKm(first, second) {
  const toRadians = (number) => number * Math.PI / 180;
  const lat1 = toRadians(first[1]);
  const lat2 = toRadians(second[1]);
  const differenceLat = toRadians(second[1] - first[1]);
  const differenceLng = toRadians(second[0] - first[0]);

  const value =
    Math.sin(differenceLat / 2) * Math.sin(differenceLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(differenceLng / 2) * Math.sin(differenceLng / 2);

  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export async function createReservation(req, res) {
  // create reservation
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({ error: "Consumer access required" });
  }
  const id = req.params && (req.params.listingId || req.params.id);
  if (typeof id !== "string" || id.length !== 24) {
    return res.status(400).json({ error: "Invalid listing ID" });
  }
  for (const character of id.toLowerCase()) {
    if ("0123456789abcdef".indexOf(character) === -1) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }
  }
  const body = req.body;
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    (typeof body.quantity !== "number" && typeof body.quantity !== "string") ||
    (typeof body.quantity === "string" && body.quantity.trim() === "")
  ) {
    return res.status(400).json({ error: "A positive integer quantity is required" });
  }
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 9007199254740991) {
    return res.status(400).json({ error: "quantity must be a positive safe integer" });
  }

  const requestId = body.checkoutRequestId;
  if (typeof requestId !== "string" || requestId.length < 16 || requestId.length > 80) {
    return res.status(400).json({ error: "checkoutRequestId must be a unique 16–80 character retry key" });
  }
  const requestKey = req.user._id.toString() + ":" + requestId;
  if (body.bundleGroupId !== undefined || body.bundleWithListingId !== undefined) {
    return res.status(400).json({
      error: "Bundles must be reserved with POST /reservations/bundle",
    });
  }

  try {
    const previous = await Reservation.findByCheckoutRequest(requestKey);
    if (previous) {
      if (previous.listing_id.toString() !== id || previous.quantity !== quantity || previous.bundle_group_id) {
        return res.status(409).json({ error: "Retry key was already used for another reservation" });
      }
      return sendCheckoutResponse(previous, res, 200);
    }
    const loaded = await loadReservableListing(id, quantity);
    if (loaded.error) {
      return res.status(loaded.status).json({ error: loaded.error });
    }
    const listing = loaded.listing;
    const business = loaded.business;
    const end = Number(listing.collection_end_at);

    const unitPrice = listing.rescue_price_sgd;
    const amount = amountInCents(unitPrice, quantity);
    if (amount === null) {
      return res.status(409).json({ error: "Price must have at most two decimals and total must be SGD 0 or SGD 0.50–999,999.99" });
    }
    const now = Number(new Date());
    if (amount > 0 && end - now < 31 * 60000) {
      return res.status(409).json({ error: "Paid checkout requires at least 31 minutes before pickup closes" });
    }
    let configuration;
    if (amount > 0) {
      try {
        configuration = checkoutConfiguration();
      } catch (error) {
        return res.status(503).json({ error: "Payments are not configured" });
      }
    }
    const data = buildReservationData({
      requestKey, user: req.user, listing, business, quantity, unitPrice, amount, now,
      configuration, bundleGroupId: null, partnerListingId: null, bundleLeg: null,
    });
    const result = await Listing.reduceStock(
      listing._id, listing.quantity_available, listing.quantity_available - quantity, listing.updated_at,
    );
    if (result.modifiedCount !== 1) {
      return res.status(409).json({ error: "Listing changed or expired. Refresh it before reserving again" });
    }

    let reservation;
    try {
      reservation = await Reservation.createReservation(data);
    } catch (error) {
      if (error.name === "ValidationError" || error.name === "CastError" || error.code === 11000) {
        try {
          const restored = await Listing.restoreStock(listing._id, quantity);
          if (!restored) {
            console.error("Reservation failed and stock restoration needs reconciliation for listing", listing._id.toString());
          }
        } catch (restoreError) {
          console.error("Reservation failed and stock restoration needs reconciliation for listing", listing._id.toString());
        }
        return res.status(500).json({ error: "Unable to create reservation" });
      }
      console.error("Reservation write outcome is uncertain; stock needs reconciliation for listing", listing._id.toString());
      return res.status(503).json({ error: "Reservation could not be confirmed. Check your reservations before retrying" });
    }

    if (reservation.payment_status === "NOT_REQUIRED") {
      await notify(
        reservation.consumer_user_id,
        `Your reservation for ${listing.title} is confirmed`
      );
      await notifyBusiness(
        reservation,
        `New reservation received for ${listing.title}`
      );
    }

    return sendCheckoutResponse(reservation, res, 201);
  } catch (error) {
    console.error("Failed to create reservation");
    return res.status(500).json({ error: "Unable to create reservation" });
  }
}

function isObjectIdString(value) {
  if (typeof value !== "string" || value.length !== 24) return false;
  for (const character of value.toLowerCase()) {
    if ("0123456789abcdef".indexOf(character) === -1) return false;
  }
  return true;
}

async function loadReservableListing(id, quantity, alreadyHeld) {
  const listing = await Listing.findListingById(id);
  if (!listing) {
    return { status: 404, error: "Listing not found" };
  }
  if (
    !alreadyHeld &&
    (listing.status !== "ACTIVE" ||
    !Number.isInteger(listing.quantity_available) ||
    listing.quantity_available > 9007199254740991 ||
    listing.quantity_available < quantity)
  ) {
    return { status: 409, error: "Listing is unavailable or has insufficient stock" };
  }
  const start = Number(listing.collection_start_at);
  const end = Number(listing.collection_end_at);
  if (
    !listing.collection_start_at || !listing.collection_end_at ||
    start - start !== 0 || end - end !== 0 || start >= end || (!alreadyHeld && end <= Number(new Date()))
  ) {
    return { status: 409, error: "Listing collection window is invalid or has expired" };
  }
  const business = await Business.findBusinessById(listing.business_id);
  if (!business) {
    return { status: 404, error: "Business not found" };
  }
  if (business.status !== "ACTIVE") {
    return { status: 409, error: "This business is not accepting reservations" };
  }
  for (const value of [listing.title, business.name, business.address]) {
    if (typeof value !== "string" || value.trim() === "") {
      return { status: 409, error: "Listing or business details are incomplete" };
    }
  }
  for (const field of ["original_price_sgd", "rescue_price_sgd"]) {
    const value = listing[field];
    if (typeof value !== "number" || value - value !== 0 || value < 0) {
      return { status: 409, error: "Listing prices are invalid" };
    }
  }
  if (
    listing.original_price_sgd <= 0 ||
    listing.rescue_price_sgd > listing.original_price_sgd
  ) {
    return { status: 409, error: "Listing prices are invalid" };
  }
  return { listing, business };
}

function buildReservationData(input) {
  const listing = input.listing;
  const business = input.business;
  const isBundle = input.bundleGroupId !== null;
  const amount = input.amount;
  const configuration = input.configuration;
  return {
    checkout_request_key: input.requestKey,
    payment_status: amount === 0 ? "NOT_REQUIRED" : "PENDING",
    amount_cents: amount,
    currency: "sgd",
    payment_due_at: amount > 0 ? new Date((parseInt(input.now / 1000) + 31 * 60) * 1000) : null,
    checkout_success_url: configuration ? configuration.success : null,
    checkout_cancel_url: configuration ? configuration.cancel : null,
    consumer_user_id: input.user._id,
    listing_id: listing._id,
    quantity: input.quantity,
    bundle_group_id: input.bundleGroupId,
    bundle_partner_listing_id: input.partnerListingId,
    bundle_discount_percent: isBundle ? 10 : 0,
    bundle_leg: isBundle ? input.bundleLeg : null,
    bundle_state: isBundle ? "FORMING" : null,
    status: "RESERVED",
    expires_at: listing.collection_end_at,
    listing_snapshot: {
      title: listing.title,
      business_id: business._id,
      business_name: business.name,
      original_unit_price_sgd: listing.original_price_sgd,
      rescue_unit_price_sgd: input.unitPrice,
      normal_rescue_unit_price_sgd: listing.rescue_price_sgd,
      collection_start_at: listing.collection_start_at,
      collection_end_at: listing.collection_end_at,
      pickup_address: business.address,
      pickup_instructions: business.pickup_instructions || "",
      pickup_coordinates: business.location.coordinates,
    },
  };
}

async function bundlePairProblem(first, second) {
  if (first.listing._id.toString() === second.listing._id.toString()) {
    return "A bundle needs two different listings";
  }
  if (!first.listing.bundle_eligible || !second.listing.bundle_eligible) {
    return "These listings cannot be bundled";
  }
  if (first.business._id.toString() === second.business._id.toString()) {
    return "Bundle listings must come from different businesses";
  }
  for (const business of [first.business, second.business]) {
    if (business.deleted_at) return "This business is not accepting reservations";
    const owner = await User.findUserById(business.owner_user_id);
    if (!owner || owner.deleted_at) return "This business is not accepting reservations";
  }
  const sameTime =
    second.listing.collection_start_at < first.listing.collection_end_at &&
    second.listing.collection_end_at > first.listing.collection_start_at;
  const firstCoordinates = first.business.location && first.business.location.coordinates;
  const secondCoordinates = second.business.location && second.business.location.coordinates;
  const nearby =
    Array.isArray(firstCoordinates) && Array.isArray(secondCoordinates) &&
    firstCoordinates.length === 2 && secondCoordinates.length === 2 &&
    distanceInKm(firstCoordinates, secondCoordinates) <= 0.5;
  if (!sameTime || !nearby) {
    return "Bundle listings must be nearby and have overlapping pickup times";
  }
  return "";
}

async function closeAndReconcile(legs) {
  const present = legs.filter(Boolean);
  await closePair(present);
  for (const leg of present) {
    try {
      await reconcileReservation(await Reservation.findReservationById(leg._id));
    } catch (error) {
      console.error("Bundle reconciliation pending for reservation", leg._id.toString());
    }
  }
}

function endedBundleMessage(legs) {
  const paid = legs.some(function (leg) {
    return leg.payment_status === "PAID" || leg.payment_status === "REFUNDED";
  });
  return paid
    ? "This bundle is no longer available, so it was cancelled. Any payment will be refunded automatically"
    : "This bundle is no longer available, so it was cancelled. Nothing was charged";
}

const PENDING_BUNDLE_MESSAGE =
  "We are still confirming this bundle. Try again in a moment; you will not be charged twice";

async function prepareBundleLegs(user, listingIds, existing, bundleGroupId, requestKeys) {
  const loaded = [];
  for (let index = 0; index < 2; index++) {
    const result = await loadReservableListing(listingIds[index], 1, !!existing[index]);
    if (result.error) return { status: result.status, error: result.error };
    loaded.push(result);
  }
  const problem = await bundlePairProblem(loaded[0], loaded[1]);
  if (problem) return { status: 409, error: problem };

  const now = Number(new Date());
  const amounts = [];
  for (let index = 0; index < 2; index++) {
    if (existing[index]) {
      amounts.push(existing[index].amount_cents);
      continue;
    }
    loaded[index].unitPrice = Math.round(loaded[index].listing.rescue_price_sgd * 90) / 100;
    const amount = amountInCents(loaded[index].unitPrice, 1);
    if (amount === null) {
      return { status: 409, error: "Price must have at most two decimals and total must be SGD 0 or SGD 0.50–999,999.99" };
    }
    if (amount > 0 && Number(loaded[index].listing.collection_end_at) - now < 31 * 60000) {
      return { status: 409, error: "Paid checkout requires at least 31 minutes before pickup closes" };
    }
    amounts.push(amount);
  }
  let configuration;
  for (let index = 0; index < 2; index++) {
    if (!existing[index] && amounts[index] > 0 && !configuration) {
      try {
        configuration = checkoutConfiguration();
      } catch (error) {
        return { status: 503, error: "Payments are not configured" };
      }
    }
  }
  const data = [];
  for (let index = 0; index < 2; index++) {
    data.push(existing[index] ? null : buildReservationData({
      requestKey: requestKeys[index], user, listing: loaded[index].listing,
      business: loaded[index].business, quantity: 1, unitPrice: loaded[index].unitPrice,
      amount: amounts[index], now, configuration,
      bundleGroupId, partnerListingId: loaded[1 - index].listing._id, bundleLeg: index + 1,
    }));
  }
  return { data };
}

function bindsToBundleRequest(row, listingId, bundleGroupId, leg) {
  return (
    row.listing_id.toString() === listingId &&
    row.bundle_group_id === bundleGroupId &&
    row.bundle_leg === leg &&
    isPairedLeg(row)
  );
}

export async function createBundleReservation(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({ error: "Consumer access required" });
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "listingId, partnerListingId and checkoutRequestId are required" });
  }
  if (!isObjectIdString(body.listingId) || !isObjectIdString(body.partnerListingId)) {
    return res.status(400).json({ error: "A bundle needs two valid listings" });
  }
  if (body.listingId.toLowerCase() === body.partnerListingId.toLowerCase()) {
    return res.status(400).json({ error: "A bundle needs two different listings" });
  }
  const requestId = body.checkoutRequestId;
  if (typeof requestId !== "string" || requestId.length < 16 || requestId.length > 80) {
    return res.status(400).json({ error: "checkoutRequestId must be a unique 16–80 character retry key" });
  }
  const userId = req.user._id.toString();
  const bundleGroupId = "bundle-" + userId + "-" + requestId;
  const listingIds = [body.listingId.toLowerCase(), body.partnerListingId.toLowerCase()];
  const requestKeys = [
    "bundle:" + userId + ":" + requestId + ":1",
    "bundle:" + userId + ":" + requestId + ":2",
  ];

  try {
    const legs = [null, null];
    for (let index = 0; index < 2; index++) {
      const found = await Reservation.findByCheckoutRequest(requestKeys[index]);
      if (found && !bindsToBundleRequest(found, listingIds[index], bundleGroupId, index + 1)) {
        return res.status(409).json({ error: "Retry key was already used for another reservation" });
      }
      legs[index] = found;
    }

    let wroteRow = false;
    if (!legs[0] || !legs[1]) {
      const prepared = await prepareBundleLegs(req.user, listingIds, legs, bundleGroupId, requestKeys);
      if (prepared.error) {
        if (legs[0] || legs[1]) await closeAndReconcile(legs);
        return res.status(prepared.status).json({ error: prepared.error });
      }
      for (let index = 0; index < 2; index++) {
        if (legs[index]) continue;
        try {
          legs[index] = await Reservation.createReservation(prepared.data[index]);
          wroteRow = true;
        } catch (error) {
          if (error.code === 11000) {
            const again = await Reservation.findByCheckoutRequest(requestKeys[index]);
            if (!again || !bindsToBundleRequest(again, listingIds[index], bundleGroupId, index + 1)) {
              return res.status(503).json({ error: PENDING_BUNDLE_MESSAGE, pending: true });
            }
            legs[index] = again;
          } else if (error.name === "ValidationError" || error.name === "CastError") {
            await closeAndReconcile(legs);
            return res.status(500).json({ error: "Unable to create reservation" });
          } else {
            console.error("Bundle write outcome is uncertain for request", bundleGroupId);
            return res.status(503).json({ error: PENDING_BUNDLE_MESSAGE, pending: true });
          }
        }
      }
    }

    const result = await completePair(bundleGroupId);
    if (result.outcome === "FAILED") {
      await closeAndReconcile(result.legs);
      const latest = sortLegs(await Reservation.findByBundleGroup(bundleGroupId));
      return res.status(409).json({ error: endedBundleMessage(latest) });
    }
    if (result.outcome === "PENDING") {
      return res.status(202).json({ status: "PENDING", bundleGroupId, message: PENDING_BUNDLE_MESSAGE });
    }

    for (const leg of result.activated) {
      if (leg.payment_status === "NOT_REQUIRED") {
        await notify(leg.consumer_user_id, `Your reservation for ${leg.listing_snapshot.title} is confirmed`);
        await notifyBusiness(leg, `New reservation received for ${leg.listing_snapshot.title}`);
      }
    }
    return sendBundleResponse(result.legs, bundleGroupId, res, wroteRow ? 201 : 200);
  } catch (error) {
    console.error("Failed to create bundle reservation");
    return res.status(500).json({ error: "Unable to create bundle reservation. Please try again" });
  }
}

async function sendBundleResponse(reservations, bundleGroupId, res, status) {
  const payloads = [];
  for (const reservation of reservations) {
    try {
      payloads.push(await checkoutPayload(reservation));
    } catch (error) {
      console.error("Checkout needs reconciliation for reservation", reservation._id.toString());
      payloads.push({ reservationId: reservation._id, checkoutUrl: null, checkoutPending: true });
    }
  }
  const latest = sortLegs(await Reservation.findByBundleGroup(bundleGroupId));
  const pair = latest.length === 2 ? pairStatus(latest[0], latest[1]) : "FORMING";
  if (pair === "VOID") {
    return res.status(409).json({ error: endedBundleMessage(latest) });
  }
  if (pair === "FORMING") {
    return res.status(202).json({ status: "PENDING", bundleGroupId, message: PENDING_BUNDLE_MESSAGE });
  }
  return res.status(status).json({ status: "READY", bundleGroupId, reservations: payloads });
}

async function checkoutPayload(reservation) {
  let checkoutUrl = null;
  if (reservation.payment_status === "PENDING") checkoutUrl = await ensureCheckout(reservation);
  const current = await Reservation.findReservationById(reservation._id);
  return {
    reservationId: current._id,
    checkoutUrl,
    reservation: {
      _id: current._id,
      consumer_user_id: current.consumer_user_id,
      reserved_at: current.reserved_at,
      updated_at: current.updated_at,
      collected_at: current.collected_at,
      cancelled_at: current.cancelled_at,
      listing_id: current.listing_id,
      quantity: current.quantity,
      bundle_group_id: current.bundle_group_id,
      bundle_partner_listing_id: current.bundle_partner_listing_id,
      bundle_discount_percent: current.bundle_discount_percent,
      bundle_leg: current.bundle_leg,
      listing_snapshot: current.listing_snapshot,
      status: current.status,
      expires_at: current.expires_at,
      payment: paymentSummary(current),
    },
  };
}

async function sendCheckoutResponse(reservation, res, status) {
  try {
    return res.status(status).json(await checkoutPayload(reservation));
  } catch (error) {
    console.error("Checkout needs reconciliation for reservation", reservation._id.toString());
    return res.status(503).json({
      error: "Checkout could not be confirmed. Retry checkout for this reservation, not a new reservation",
      reservationId: reservation._id,
    });
  }
}

export async function getMyReservations(req, res) {
  // get reservations
  const status = req.query.status;

  if (
    status !== undefined &&
    status !== "RESERVED" &&
    status !== "COLLECTED" &&
    status !== "CANCELLED" &&
    status !== "EXPIRED"
  ) {
    return res.status(400).json({
      error: "Invalid reservation status",
    });
  }

  try {
    const results = await Reservation.findReservationsByConsumer(req.user._id);
    const reservations = [];

    function bundlePairStatus(reservation) {
      if (!isPairedLeg(reservation)) return null;
      let partner = null;
      for (const other of results) {
        if (
          other.bundle_group_id === reservation.bundle_group_id &&
          other.bundle_leg !== reservation.bundle_leg &&
          other.bundle_state
        ) {
          partner = other;
        }
      }
      return pairStatus(reservation, partner);
    }

    for (const reservation of results) {
      if (status !== undefined && reservation.status !== status) {
        continue;
      }

      const review = await Review.findReviewByReservation(reservation._id);
      const business = await Business.findBusinessById(reservation.listing_snapshot.business_id);
      const thumbnailUrl = await getListingThumbnailUrl(reservation.listing_id);

      reservations.push({
        _id: reservation._id,
        consumer_user_id: reservation.consumer_user_id,
        listing_id: reservation.listing_id,
        quantity: reservation.quantity,
        bundle_group_id: reservation.bundle_group_id,
        bundle_partner_listing_id: reservation.bundle_partner_listing_id,
        bundle_discount_percent: reservation.bundle_discount_percent,
        bundle_leg: reservation.bundle_leg,
        bundle_pair_status: bundlePairStatus(reservation),
        listing_snapshot: reservation.listing_snapshot,
        status: reservation.status,
        payment: paymentSummary(reservation),
        expires_at: reservation.expires_at,
        collected_at: reservation.collected_at,
        cancelled_at: reservation.cancelled_at,
        reserved_at: reservation.reserved_at,
        updated_at: reservation.updated_at,
        review: review,
        thumbnail_url: thumbnailUrl,
        pickup_instructions: typeof reservation.listing_snapshot.pickup_instructions === "string"
          ? reservation.listing_snapshot.pickup_instructions
          : business ? business.pickup_instructions : "",
        pickup_coordinates: Array.isArray(reservation.listing_snapshot.pickup_coordinates) &&
          reservation.listing_snapshot.pickup_coordinates.length === 2
          ? reservation.listing_snapshot.pickup_coordinates
          : business && business.location ? business.location.coordinates : [],
      });
    }

    return res.status(200).json({ reservations });
  } catch (error) {
    console.error("Failed to get reservations:", error);

    return res.status(500).json({
      error: "Unable to get reservations",
    });
  }
}

export async function getReservationById(req, res) {
  // get reservation by id
  if (!req.user) {
    return res.status(404).json({
      error: "Profile not found",
    });
  }

  const id = req.params.reservationId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Reservation ID is required",
    });
  }

  try {
    const reservation = await Reservation.findReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
      });
    }

    let canView =
      reservation.consumer_user_id.toString() === req.user._id.toString();

    if (!canView && req.user.role === "BUSINESS") {
      const business = await Business.findBusinessById(
        reservation.listing_snapshot.business_id,
      );

      if (
        business &&
        business.owner_user_id.toString() === req.user._id.toString()
      ) {
        canView = true;
      }
    }

    if (!canView) {
      return res.status(403).json({
        error: "You cannot access this reservation",
      });
    }

    return res.status(200).json({
      reservation: {
        _id: reservation._id,
        consumer_user_id: reservation.consumer_user_id,
        listing_id: reservation.listing_id,
        quantity: reservation.quantity,
        listing_snapshot: reservation.listing_snapshot,
        status: reservation.status,
        payment: paymentSummary(reservation),
        expires_at: reservation.expires_at,
        collected_at: reservation.collected_at,
        cancelled_at: reservation.cancelled_at,
        reserved_at: reservation.reserved_at,
        updated_at: reservation.updated_at,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid reservation ID",
      });
    }

    console.error("Failed to get reservation:", error);

    return res.status(500).json({
      error: "Unable to get reservation",
    });
  }
}

export async function getBusinessReservations(req, res) {
  // get business reservations
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  const status = req.query.status;

  if (
    status !== undefined &&
    status !== "RESERVED" &&
    status !== "COLLECTED" &&
    status !== "CANCELLED" &&
    status !== "EXPIRED"
  ) {
    return res.status(400).json({
      error: "Invalid reservation status",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    const listings = await Listing.findListingsByBusiness(business._id);
    const reservations = [];

    for (const listing of listings) {
      const results = await Reservation.findReservationsByListing(
        listing._id,
        status,
      );

      for (const reservation of results) {
        if (
          reservation.listing_snapshot.business_id.toString() !==
          business._id.toString()
        ) {
          continue;
        }

        reservations.push({
          _id: reservation._id,
          consumer_user_id: reservation.consumer_user_id,
          listing_id: reservation.listing_id,
          quantity: reservation.quantity,
          listing_snapshot: reservation.listing_snapshot,
          status: reservation.status,
          payment: paymentSummary(reservation),
          expires_at: reservation.expires_at,
          collected_at: reservation.collected_at,
          cancelled_at: reservation.cancelled_at,
          reserved_at: reservation.reserved_at,
          updated_at: reservation.updated_at,
        });
      }
    }

    return res.status(200).json({ reservations });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get business reservations:", error);

    return res.status(500).json({
      error: "Unable to get business reservations",
    });
  }
}


async function cancelPairedReservation(reservation, user, res) {
  const partner = await loadPartner(reservation);
  const status = pairStatus(reservation, partner);
  const alreadyCancelled = reservation.status === "CANCELLED";
  if (!alreadyCancelled) {
    if (reservation.status !== "RESERVED") {
      return res.status(409).json({ error: "Only reserved reservations can be cancelled" });
    }
    if (status === "COMMITTED") {
      return res.status(409).json({
        error: "The other item in this bundle has already been collected, so this order can no longer be cancelled. Collect it before pickup closes",
      });
    }
    const result = await Reservation.cancelReservation(reservation._id, user._id);
    if (result.modifiedCount !== 1) {
      const current = await Reservation.findReservationById(reservation._id);
      if (!current || current.status !== "CANCELLED") {
        return res.status(409).json({
          error: "This order can no longer be cancelled. Its pickup may have closed, or the other item in the bundle is being collected",
        });
      }
    } else {
      await notifyBusiness(reservation, `A reservation for ${reservation.listing_snapshot.title} has been cancelled`);
    }
  }
  if (partner && partner.status === "RESERVED") {
    await Reservation.cancelBundleLeg(partner._id);
    await notifyBusiness(partner, `A reservation for ${partner.listing_snapshot.title} has been cancelled`);
  }
  for (const leg of [reservation, partner]) {
    if (!leg) continue;
    try {
      await reconcileReservation(await Reservation.findReservationById(leg._id));
    } catch (error) {
      console.error("Cancellation payment reconciliation pending", leg._id.toString());
    }
  }
  const current = await Reservation.findReservationById(reservation._id);
  return res.status(200).json({
    reservationId: current._id,
    status: current.status,
    payment: paymentSummary(current),
    bundleCancelled: true,
    stockRestorationPending: current.stock_release_status !== "RELEASED",
    message: "Bundle cancelled. Both items were cancelled and any payment will be refunded",
  });
}

export async function cancelReservation(req, res) {
  console.log("CANCEL ENDPOINT REACHED");
  // cancel reservation
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({ error: "Consumer access required" });
  }
  const id = req.params && (req.params.reservationId || req.params.id);
  if (typeof id !== "string" || id.length !== 24) {
    return res.status(400).json({ error: "Invalid reservation ID" });
  }
  for (const character of id.toLowerCase()) {
    if ("0123456789abcdef".indexOf(character) === -1) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }
  }

  try {
    const reservation = await Reservation.findReservationById(id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not own this reservation" });
    }
    if (isPairedLeg(reservation)) {
      return cancelPairedReservation(reservation, req.user, res);
    }
    if (reservation.amount_cents !== null && reservation.amount_cents !== undefined) {
      if (reservation.status !== "CANCELLED") {
        const result = await Reservation.cancelReservation(reservation._id, req.user._id);
        console.log("Cancellation result:", result);
        if (result.modifiedCount === 1) {
          await notifyBusiness(
            reservation,
            `A reservation for ${reservation.listing_snapshot.title} has been cancelled`
          );
        } else {
          const current = await Reservation.findReservationById(reservation._id);

          if (!current || current.status !== "CANCELLED") {
            return res.status(409).json({
              error: "Reservation changed or cancellation deadline passed"
            });
          }
        }
      }
      try {
        await reconcileReservation(await Reservation.findReservationById(reservation._id));
      } catch (error) {
        console.error("Cancellation payment reconciliation pending", id);
      }
      const current = await Reservation.findReservationById(reservation._id);
      return res.status(200).json({
        reservationId: current._id,
        status: current.status,
        payment: paymentSummary(current),
        stockRestorationPending: current.stock_release_status !== "RELEASED",
        message: "Reservation cancelled. Payment and stock reconciliation may still be pending",
      });
    }
    const response = { reservationId: reservation._id, status: "CANCELLED" };
    if (reservation.status === "CANCELLED") {
      response.message = "Reservation is already cancelled";
      return res.status(200).json(response);
    }
    if (reservation.status !== "RESERVED") {
      return res.status(409).json({ error: "Only reserved reservations can be cancelled" });
    }
    const snapshot = reservation.listing_snapshot;
    const expiry = Number(reservation.expires_at);
    const end = snapshot && Number(snapshot.collection_end_at);
    const now = Number(new Date());
    if (
      !reservation.expires_at || !snapshot || !snapshot.collection_end_at ||
      expiry - expiry !== 0 || end - end !== 0 || expiry <= now || end <= now
    ) {
      return res.status(409).json({ error: "The reservation cancellation deadline has passed or is unavailable" });
    }
    if (
      !reservation.listing_id || !Number.isInteger(reservation.quantity) ||
      reservation.quantity <= 0 || reservation.quantity > 9007199254740991
    ) {
      return res.status(409).json({ error: "Reservation inventory details are invalid" });
    }

    let result;
    try {
      result = await Reservation.cancelReservation(reservation._id, req.user._id);
    } catch (error) {
      console.error("Cancellation write outcome is uncertain; inventory needs reconciliation for reservation", id);
      return res.status(503).json({ error: "Cancellation could not be confirmed. Check your reservations before retrying" });
    }
    if (result.modifiedCount !== 1) {
      const current = await Reservation.findReservationById(id);
      if (
        current && current.status === "CANCELLED" &&
        current.consumer_user_id.toString() === req.user._id.toString()
      ) {
        response.message = "Reservation is already cancelled";
        return res.status(200).json(response);
      }
      return res.status(409).json({ error: "Reservation changed or expired and could not be cancelled" });
    }

    let stockRestorationPending = false;
    try {
      const restored = await Listing.restoreStock(reservation.listing_id, reservation.quantity, reservation._id);
      stockRestorationPending = !restored;
      if (restored) {
        try {
          await Reservation.clearStockRestorePending(reservation._id);
        } catch (clearError) {
          console.error("Failed to clear stock restore pending flag for reservation", id);
        }
      }
    } catch (error) {
      stockRestorationPending = true;
    }
    if (stockRestorationPending) {
      console.error("Cancelled reservation requires stock reconciliation", id);
      response.stockRestorationPending = true;
      response.message = "Reservation cancelled; stock restoration will be retried automatically";
    } else {
      response.message = "Reservation cancelled successfully";
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error("Failed to cancel reservation");
    return res.status(500).json({ error: "Unable to cancel reservation" });
  }
}
