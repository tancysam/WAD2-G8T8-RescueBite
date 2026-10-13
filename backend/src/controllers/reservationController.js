import Reservation from "../models/Reservation.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";

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

  try {
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
    for (const field of [
      "original_price_sgd", "rescue_price_sgd",
      "estimated_weight_kg_per_unit", "estimated_meals_per_unit",
    ]) {
      const value = listing[field];
      if (typeof value !== "number" || value - value !== 0 || value < 0) {
        return res.status(409).json({ error: "Listing prices or impact estimates are invalid" });
      }
    }
    if (
      listing.original_price_sgd <= 0 ||
      listing.rescue_price_sgd > listing.original_price_sgd ||
      listing.estimated_weight_kg_per_unit <= 0 ||
      listing.estimated_meals_per_unit <= 0
    ) {
      return res.status(409).json({ error: "Listing prices or impact estimates are invalid" });
    }

    const data = {
      consumer_user_id: req.user._id,
      listing_id: listing._id,
      quantity,
      status: "RESERVED",
      expires_at: listing.collection_end_at,
      listing_snapshot: {
        title: listing.title,
        business_id: business._id,
        business_name: business.name,
        original_unit_price_sgd: listing.original_price_sgd,
        rescue_unit_price_sgd: listing.rescue_price_sgd,
        collection_start_at: listing.collection_start_at,
        collection_end_at: listing.collection_end_at,
        pickup_address: business.address,
        estimated_weight_kg_per_unit: listing.estimated_weight_kg_per_unit,
        estimated_meals_per_unit: listing.estimated_meals_per_unit,
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
          if (!restored || restored.modifiedCount !== 1) {
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

    return res.status(201).json({
      reservation: {
        _id: reservation._id,
        consumer_user_id: reservation.consumer_user_id,
        listing_id: reservation.listing_id,
        quantity: reservation.quantity,
        listing_snapshot: reservation.listing_snapshot,
        status: reservation.status,
        expires_at: reservation.expires_at,
        collected_at: reservation.collected_at,
        cancelled_at: reservation.cancelled_at,
        reserved_at: reservation.reserved_at,
        updated_at: reservation.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to create reservation");
    return res.status(500).json({ error: "Unable to create reservation" });
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

      reservations.push({
        _id: reservation._id,
        consumer_user_id: reservation.consumer_user_id,
        listing_id: reservation.listing_id,
        quantity: reservation.quantity,
        listing_snapshot: reservation.listing_snapshot,
        status: reservation.status,
        expires_at: reservation.expires_at,
        collected_at: reservation.collected_at,
        cancelled_at: reservation.cancelled_at,
        reserved_at: reservation.reserved_at,
        updated_at: reservation.updated_at,
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

export async function updateReservationStatus(req, res) {
  // update reservation status
}

export async function cancelReservation(req, res) {
  // cancel reservation
}
