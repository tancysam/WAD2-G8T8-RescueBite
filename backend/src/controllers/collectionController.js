import Business from "../models/Business.js";
import Reservation from "../models/Reservation.js";

function isHexString(value, length) {
  if (typeof value !== "string" || value.length !== length) {
    return false;
  }

  for (const character of value) {
    if ("0123456789abcdef".indexOf(character) === -1) {
      return false;
    }
  }

  return true;
}

function collectionError(reservation, requireStarted) {
  if (reservation.status !== "RESERVED") {
    return "Reservation is not available for collection";
  }

  const snapshot = reservation.listing_snapshot;
  if (
    !snapshot ||
    !snapshot.collection_start_at ||
    !snapshot.collection_end_at ||
    !reservation.expires_at
  ) {
    return "Reservation collection times are unavailable";
  }

  const start = Number(snapshot.collection_start_at);
  const end = Number(snapshot.collection_end_at);
  const expiry = Number(reservation.expires_at);
  const now = Number(new Date());

  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(expiry) || start > end) {
    return "Reservation collection times are invalid";
  }

  if (now > end || now > expiry) {
    return "Reservation collection window has expired";
  }

  if (requireStarted && now < start) {
    return "Reservation collection window has not started";
  }

  return "";
}

export async function getCollectionCode(req, res) {
  // create collection
  res.setHeader("Cache-Control", "no-store"); // ensure that the response is not cached
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({ error: "Consumer access required" });
  }

  const id = req.query.reservationId;
  if (!isHexString(id, 24)) {
    return res.status(400).json({ error: "Invalid reservation ID" });
  }

  try {
    const reservation = await Reservation.findReservationById(id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You cannot access this reservation" });
    }

    const error = collectionError(reservation, false);
    if (error) {
      return res.status(409).json({ error });
    }
    if (!isHexString(reservation.collection_code, 64)) {
      return res.status(409).json({ error: "Collection code is unavailable" });
    }

    const reservationId = reservation._id.toString();
    return res.status(200).json({
      reservationId,
      collectionCode: reservationId + ":" + reservation.collection_code,
      expiresAt: reservation.expires_at,
    });
  } catch (error) {
    console.error("Failed to get collection code");
    return res.status(500).json({ error: "Unable to get collection code" });
  }
}

export async function verifyCollectionCode(req, res) {
  // verify collection code
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "BUSINESS") {
    return res.status(403).json({ error: "Business access required" });
  }

  const body = req.body;
  if (
    !body ||
    Array.isArray(body) ||
    !isHexString(body.businessId, 24) ||
    typeof body.collectionCode !== "string" ||
    body.collectionCode.length !== 89
  ) {
    return res.status(400).json({ error: "Business ID and valid collection code are required" });
  }

  const parts = body.collectionCode.split(":");
  if (
    parts.length !== 2 ||
    !isHexString(parts[0], 24) ||
    !isHexString(parts[1], 64)
  ) {
    return res.status(400).json({ error: "Invalid collection code format" });
  }

  const reservationId = parts[0];
  const code = parts[1];

  try {
    const business = await Business.findBusinessById(body.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not own this business" });
    }

    const reservation = await Reservation.findReservationById(reservationId);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (!reservation.listing_snapshot || !reservation.listing_snapshot.business_id) {
      return res.status(409).json({ error: "Reservation business is unavailable" });
    }
    if (reservation.listing_snapshot.business_id.toString() !== business._id.toString()) {
      return res.status(403).json({ error: "Reservation does not belong to this business" });
    }
    if (reservation.collection_code !== code) {
      return res.status(400).json({ error: "Invalid collection code" });
    }

    const error = collectionError(reservation, true);
    if (error) {
      return res.status(409).json({ error });
    }

    const result = await Reservation.markCollected(
      reservationId,
      code,
      business._id.toString(),
      req.user._id.toString(),
    );
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      return res.status(409).json({ error: "Reservation is no longer available for collection" });
    }

    return res.status(200).json({
      reservationId,
      status: "COLLECTED",
      message: "Collection completed successfully",
    });
  } catch (error) {
    console.error("Failed to verify collection code");
    return res.status(500).json({ error: "Unable to verify collection code" });
  }
}
