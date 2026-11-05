const mongoose = require("mongoose");

const BUSINESS_STATUSES = ["ACTIVE", "INACTIVE"];

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "coordinates must be [longitude, latitude]",
      },
    },
  },
  { _id: false },
);

const businessSchema = new mongoose.Schema(
  {
    owner_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "owner_user_id is required"],
    },
    name: {
      type: String,
      required: [true, "name is required"],
      trim: true,
    },
    description: {
      type: String,
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
      required: [true, "address is required"],
      trim: true,
    },
    postal_code: {
      type: String,
      required: [true, "postal_code is required"],
      trim: true,
    },
    location: {
      type: pointSchema,
      required: [true, "location is required"],
    },
    pickup_instructions: {
      type: String,
    },
    status: {
      type: String,
      default: "ACTIVE",
      enum: BUSINESS_STATUSES,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

businessSchema.index({ location: "2dsphere" });
businessSchema.index({ owner_user_id: 1 });

const Business = mongoose.model("Business", businessSchema, "businesses");

function findBusinessById(id) {
  return Business.findOne({ _id: id });
}

function findBusinessesByOwnerId(ownerUserId) {
  return Business.find({ owner_user_id: ownerUserId });
}

function findActiveBusinesses() {
  return Business.find({ status: "ACTIVE" });
}

function findNearbyActiveBusinesses(lat, lng, radiusKm) {
  return Business.find({
    status: "ACTIVE",
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  });
}

function addBusiness(data) {
  return Business.create(data);
}

function updateBusiness(id, update) {
  return Business.updateOne({ _id: id }, update);
}

function setBusinessStatus(id, status) {
  return Business.updateOne({ _id: id }, { status: status });
}

function markBusinessDeleted(id) {
  return Business.updateOne(
    { _id: id, deleted_at: null },
    { deleted_at: new Date() },
  );
}

module.exports = {
  BUSINESS_STATUSES,
  findBusinessById,
  findBusinessesByOwnerId,
  findActiveBusinesses,
  findNearbyActiveBusinesses,
  addBusiness,
  updateBusiness,
  setBusinessStatus,
  markBusinessDeleted,
};
