const mongoose = require("mongoose");
const { generateToken } = require("../utils/tokenUtils.js");

const RESERVATION_STATUSES = ["RESERVED", "COLLECTED", "CANCELLED", "EXPIRED"];

const listingSnapshotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    business_name: { type: String, required: true },
    original_unit_price_sgd: { type: Number, required: true },
    rescue_unit_price_sgd: { type: Number, required: true },
    collection_start_at: { type: Date, required: true },
    collection_end_at: { type: Date, required: true },
    pickup_address: { type: String, required: true },
    pickup_instructions: { type: String },
    pickup_coordinates: { type: [Number] },
  },
  { _id: false },
);

const reservationSchema = new mongoose.Schema(
  {
    consumer_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "consumer_user_id is required"],
    },
    listing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "listing_id is required"],
    },
    quantity: { type: Number, required: [true, "quantity is required"] },
    listing_snapshot: {
      type: listingSnapshotSchema,
      required: [true, "listing_snapshot is required"],
    },
    status: { type: String, default: "RESERVED", enum: RESERVATION_STATUSES },
    collection_code: {
      type: String,
      required: [true, "collection_code is required"],
      unique: true,
    },
    expires_at: { type: Date, required: [true, "expires_at is required"] },
    collected_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    verified_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    stock_restore_pending: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "reserved_at", updatedAt: "updated_at" } },
);

reservationSchema.index({ consumer_user_id: 1, reserved_at: 1 });
reservationSchema.index({ listing_id: 1, status: 1 });
reservationSchema.index({ status: 1, expires_at: 1 });
reservationSchema.index({ stock_restore_pending: 1 });

const Reservation = mongoose.model(
  "Reservation",
  reservationSchema,
  "reservations",
);

function findReservationById(id) {
  return Reservation.findOne({ _id: id });
}

function findReservationsByConsumer(consumerUserId) {
  return Reservation.find({ consumer_user_id: consumerUserId });
}

function findReservationsByListing(listingId, status) {
  const filter = { listing_id: listingId };
  if (status !== undefined) {
    filter.status = status;
  }
  return Reservation.find(filter);
}

function findCollectedReservationsByBusiness(businessId) {
  return Reservation.find({
    "listing_snapshot.business_id": businessId,
    status: "COLLECTED",
  });
}

function findCollectedReservationsByConsumer(consumerUserId) {
  return Reservation.find({
    consumer_user_id: consumerUserId,
    status: "COLLECTED",
  });
}

function createReservation(data) {
  const reservationData = {};
  for (const key of Object.keys(data)) {
    reservationData[key] = data[key];
  }
  reservationData.collection_code = generateToken();
  return Reservation.create(reservationData);
}

function markCollected(reservationId, code, businessId, verifierUserId, collectedAt) {
  return Reservation.updateOne(
    {
      _id: reservationId,
      collection_code: code,
      "listing_snapshot.business_id": businessId,
      status: "RESERVED",
      expires_at: { $gte: collectedAt },
      "listing_snapshot.collection_start_at": { $lte: collectedAt },
      "listing_snapshot.collection_end_at": { $gte: collectedAt },
    },
    {
      status: "COLLECTED",
      verified_by_user_id: verifierUserId,
      collected_at: collectedAt,
    },
  );
}

function cancelReservation(reservationId, consumerUserId) {
  const cancelledAt = new Date();
  const deadline = new Date(Number(cancelledAt) + 1);
  return Reservation.updateOne(
    {
      _id: reservationId,
      consumer_user_id: consumerUserId,
      status: "RESERVED",
      expires_at: { $gte: deadline },
      "listing_snapshot.collection_end_at": { $gte: deadline },
    },
    {
      status: "CANCELLED",
      cancelled_at: cancelledAt,
      stock_restore_pending: true,
    },
  );
}

function findOpenReservationsByConsumer(consumerUserId) {
  return Reservation.find({
    consumer_user_id: consumerUserId,
    status: "RESERVED",
  });
}

function findOverdueReservations() {
  return Reservation.find({
    status: "RESERVED",
    expires_at: { $lt: new Date() },
  });
}

function expireReservation(reservationId) {
  return Reservation.updateOne(
    { _id: reservationId, status: "RESERVED" },
    { status: "EXPIRED", stock_restore_pending: true },
  );
}

function findPendingStockRestores() {
  return Reservation.find({ stock_restore_pending: true });
}

function clearStockRestorePending(reservationId) {
  return Reservation.updateOne(
    { _id: reservationId, stock_restore_pending: true },
    { stock_restore_pending: false },
  );
}

module.exports = {
  RESERVATION_STATUSES,
  findReservationById,
  findReservationsByConsumer,
  findReservationsByListing,
  findCollectedReservationsByConsumer,
  findCollectedReservationsByBusiness,
  createReservation,
  markCollected,
  cancelReservation,
  findOpenReservationsByConsumer,
  findOverdueReservations,
  expireReservation,
  findPendingStockRestores,
  clearStockRestorePending,
};
