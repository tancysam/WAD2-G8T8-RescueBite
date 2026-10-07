const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    reservation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: [true, "reservation_id is required"],
      unique: true,
    },
    rating: { type: Number, required: [true, "rating is required"] },
    comment: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const Review = mongoose.model("Review", reviewSchema, "reviews");

function findReviewById(id) {
  return Review.findOne({ _id: id });
}

function findReviewByReservation(reservationId) {
  return Review.findOne({ reservation_id: reservationId });
}

function findReviewsByReservationIds(ids) {
  return Review.find({ reservation_id: { $in: ids } });
}

function addReview(data) {
  return Review.create(data);
}

function updateReview(id, update) {
  return Review.updateOne({ _id: id }, update);
}

function deleteReview(id) {
  return Review.deleteOne({ _id: id });
}

module.exports = {
  findReviewById,
  findReviewByReservation,
  findReviewsByReservationIds,
  addReview,
  updateReview,
  deleteReview,
};
