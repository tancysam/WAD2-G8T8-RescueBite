import Reservation from "../models/Reservation.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import Review from "../models/Review.js";
import { getListingThumbnailUrl } from "./listingImageController.js";
import { amountInCents, checkoutConfiguration, ensureCheckout, paymentSummary, reconcileReservation } from "../services/paymentService.js";
import { notify, notifyBusiness } from "../services/notificationService.js";


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
  const bundleGroupId = body.bundleGroupId;
  const partnerListingId = body.bundleWithListingId;
  const isBundle = bundleGroupId !== undefined || partnerListingId !== undefined;

  if (
    isBundle &&
    (
      typeof bundleGroupId !== "string" ||
      bundleGroupId.length < 16 ||
      bundleGroupId.length > 80 ||
      typeof partnerListingId !== "string" ||
      partnerListingId.length !== 24 ||
      !partnerListingId.split("").every((character) =>
        "0123456789abcdef".includes(character.toLowerCase())
      ) ||
      quantity !== 1
    )
  ) {
    return res.status(400).json({
      error: "A bundle needs two valid listings and a quantity of 1",
    });
  }

  try {
    const previous = await Reservation.findByCheckoutRequest(requestKey);
    if (previous) {
      if (previous.listing_id.toString() !== id || previous.quantity !== quantity || previous.bundle_group_id !== (isBundle ? bundleGroupId : null)) {
        return res.status(409).json({ error: "Retry key was already used for another reservation" });
      }
      return sendCheckoutResponse(previous, res, 200);
    }
    const listing = await Listing.findListingById(id);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }
    if (
      listing.status !== "ACTIVE" ||
      !Number.isInteger(listing.quantity_available) ||
      listing.quantity_available > 9007199254740991 ||
      listing.quantity_available < quantity
    ) {
      return res.status(409).json({ error: "Listing is unavailable or has insufficient stock" });
    }
    const start = Number(listing.collection_start_at);
    const end = Number(listing.collection_end_at);
    if (
      !listing.collection_start_at || !listing.collection_end_at ||
      start - start !== 0 || end - end !== 0 || start >= end || end <= Number(new Date())
    ) {
      return res.status(409).json({ error: "Listing collection window is invalid or has expired" });
    }
    const business = await Business.findBusinessById(listing.business_id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (business.status !== "ACTIVE") {
      return res.status(409).json({ error: "This business is not accepting reservations" });
    }
    for (const value of [listing.title, business.name, business.address]) {
      if (typeof value !== "string" || value.trim() === "") {
        return res.status(409).json({ error: "Listing or business details are incomplete" });
      }
    }
    for (const field of ["original_price_sgd", "rescue_price_sgd"]) {
      const value = listing[field];
      if (typeof value !== "number" || value - value !== 0 || value < 0) {
        return res.status(409).json({ error: "Listing prices are invalid" });
      }
    }
    if (
      listing.original_price_sgd <= 0 ||
      listing.rescue_price_sgd > listing.original_price_sgd
    ) {
      return res.status(409).json({ error: "Listing prices are invalid" });
    }

    let unitPrice = listing.rescue_price_sgd;
    let partnerListing = null;

    if (isBundle) {
      partnerListing = await Listing.findListingById(partnerListingId);

      if (!listing.bundle_eligible || !partnerListing || !partnerListing.bundle_eligible) {
        return res.status(409).json({ error: "These listings cannot be bundled" });
      }

      const partnerBusiness = await Business.findBusinessById(partnerListing.business_id);
      const differentBusiness =
        partnerBusiness &&
        business._id.toString() !== partnerBusiness._id.toString();
      const sameTime =
        partnerListing.collection_start_at < listing.collection_end_at &&
        partnerListing.collection_end_at > listing.collection_start_at;
      const firstCoordinates = business.location && business.location.coordinates;
      const secondCoordinates =
        partnerBusiness && partnerBusiness.location && partnerBusiness.location.coordinates;
      const nearby =
        firstCoordinates && secondCoordinates &&
        distanceInKm(firstCoordinates, secondCoordinates) <= 0.5;

      if (
        !differentBusiness ||
        !sameTime ||
        !nearby
      ) {
        return res.status(409).json({
          error: "Bundle listings must be nearby and have overlapping pickup times",
        });
      }

      unitPrice = Math.round(listing.rescue_price_sgd * 90) / 100;
    }

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
    const data = {
      checkout_request_key: requestKey,
      payment_status: amount === 0 ? "NOT_REQUIRED" : "PENDING",
      amount_cents: amount,
      currency: "sgd",
      payment_due_at: amount > 0 ? new Date((parseInt(now / 1000) + 31 * 60) * 1000) : null,
      checkout_success_url: configuration ? configuration.success : null,
      checkout_cancel_url: configuration ? configuration.cancel : null,
      consumer_user_id: req.user._id,
      listing_id: listing._id,
      quantity,
      bundle_group_id: isBundle ? bundleGroupId : null,
      bundle_partner_listing_id: isBundle ? partnerListing._id : null,
      bundle_discount_percent: isBundle ? 10 : 0,
      status: "RESERVED",
      expires_at: listing.collection_end_at,
      listing_snapshot: {
        title: listing.title,
        business_id: business._id,
        business_name: business.name,
        original_unit_price_sgd: listing.original_price_sgd,
        rescue_unit_price_sgd: unitPrice,
        normal_rescue_unit_price_sgd: listing.rescue_price_sgd,
        collection_start_at: listing.collection_start_at,
        collection_end_at: listing.collection_end_at,
        pickup_address: business.address,
        pickup_instructions: business.pickup_instructions || "",
        pickup_coordinates: business.location.coordinates,
      },
    };
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

async function sendCheckoutResponse(reservation, res, status) {
  let checkoutUrl = null;
  try {
    if (reservation.payment_status === "PENDING") checkoutUrl = await ensureCheckout(reservation);
    const current = await Reservation.findReservationById(reservation._id);
    return res.status(status).json({
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
        listing_snapshot: current.listing_snapshot,
        status: current.status,
        expires_at: current.expires_at,
        payment: paymentSummary(current),
      },
    });
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
