import Review from "../models/Review.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import Reservation from "../models/Reservation.js";

export async function getBusinessReviews(req, res) {
  // get reviews
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business || business.status !== "ACTIVE") {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    const listings = await Listing.findListingsByBusiness(business._id);
    const reservationIds = [];

    for (const listing of listings) {
      const reservations = await Reservation.findReservationsByListing(
        listing._id,
        "COLLECTED",
      );

      for (const reservation of reservations) {
        if (
          reservation.listing_snapshot.business_id.toString() ===
          business._id.toString()
        ) {
          reservationIds.push(reservation._id);
        }
      }
    }

    const reviews = await Review.findReviewsByReservationIds(reservationIds);

    return res.status(200).json({ reviews });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get business reviews:", error);

    return res.status(500).json({
      error: "Unable to get business reviews",
    });
  }
}

export async function createReview(req, res) {
  // add review
  const id = req.params.reservationId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Reservation ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Review details are required",
    });
  }

  if (
    typeof body.rating !== "number" ||
    Number.isNaN(body.rating) ||
    body.rating < 1 ||
    body.rating > 5 ||
    body.rating % 1 !== 0
  ) {
    return res.status(400).json({
      error: "rating must be an integer from 1 to 5",
    });
  }

  if (body.comment !== undefined && typeof body.comment !== "string") {
    return res.status(400).json({
      error: "comment must be a string",
    });
  }

  try {
    const reservation = await Reservation.findReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
      });
    }

    if (reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this reservation",
      });
    }

    if (reservation.status !== "COLLECTED") {
      return res.status(400).json({
        error: "Only collected reservations can be reviewed",
      });
    }

    const existingReview = await Review.findReviewByReservation(
      reservation._id,
    );

    if (existingReview) {
      return res.status(409).json({
        error: "This reservation already has a review",
      });
    }

    const data = { reservation_id: reservation._id, rating: body.rating };

    if (body.comment !== undefined) {
      data.comment = body.comment.trim();
    }

    const review = await Review.addReview(data);

    return res.status(201).json({ review });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid reservation ID",
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        error: "This reservation already has a review",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid review details",
      });
    }

    console.error("Failed to create review:", error);

    return res.status(500).json({
      error: "Unable to create review",
    });
  }
}

export async function updateReview(req, res) {
  // update review
  const id = req.params.reviewId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Review ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Review details are required",
    });
  }

  const update = {};

  if (body.rating !== undefined) {
    if (
      typeof body.rating !== "number" ||
      Number.isNaN(body.rating) ||
      body.rating < 1 ||
      body.rating > 5 ||
      body.rating % 1 !== 0
    ) {
      return res.status(400).json({
        error: "rating must be an integer from 1 to 5",
      });
    }

    update.rating = body.rating;
  }

  if (body.comment !== undefined) {
    if (typeof body.comment !== "string") {
      return res.status(400).json({
        error: "comment must be a string",
      });
    }

    update.comment = body.comment.trim();
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({
      error: "Provide at least one editable review field",
    });
  }

  try {
    const review = await Review.findReviewById(id);

    if (!review) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    const reservation = await Reservation.findReservationById(
      review.reservation_id,
    );

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
      });
    }

    if (reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this review",
      });
    }

    if (reservation.status !== "COLLECTED") {
      return res.status(400).json({
        error: "Only collected reservations can be reviewed",
      });
    }

    const result = await Review.updateReview(review._id, update);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    return res.status(200).json({
      message: "Review updated successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid review ID",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid review details",
      });
    }

    console.error("Failed to update review:", error);

    return res.status(500).json({
      error: "Unable to update review",
    });
  }
}

export async function deleteReview(req, res) {
  // delete review
  const id = req.params.reviewId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Review ID is required",
    });
  }

  try {
    const review = await Review.findReviewById(id);

    if (!review) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    const reservation = await Reservation.findReservationById(
      review.reservation_id,
    );

    if (!reservation) {
      return res.status(404).json({
        error: "Reservation not found",
      });
    }

    if (reservation.consumer_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this review",
      });
    }

    const result = await Review.deleteReview(review._id);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    return res.status(200).json({
      message: "Review deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid review ID",
      });
    }

    console.error("Failed to delete review:", error);

    return res.status(500).json({
      error: "Unable to delete review",
    });
  }
}
