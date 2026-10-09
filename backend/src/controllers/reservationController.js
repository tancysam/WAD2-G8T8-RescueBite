import Reservation from "../models/Reservation.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";

export async function createReservation(req, res) {
  // create reservation
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
