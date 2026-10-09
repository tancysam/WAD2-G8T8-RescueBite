const mongoose = require("mongoose");

const BUSINESS_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "INACTIVE"];

// this point schema is for location coordinates, and it being easier to query to find out
// nearby businesses. New thing, need to test it out.
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
      default: "PENDING",
      enum: BUSINESS_STATUSES,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

businessSchema.index({ location: "2dsphere" });
businessSchema.index({ owner_user_id: 1 });

const Business = mongoose.model("Business", businessSchema, "businesses");

function getAllBusinesses() {
  return Business.find();
}

function findBusinessById(id) {
  return Business.findOne({ _id: id });
}

function findBusinessesByOwnerId(ownerUserId) {
  return Business.find({ owner_user_id: ownerUserId });
}

function findActiveBusinesses() {
  return Business.find({ status: "ACTIVE" });
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

module.exports = {
  BUSINESS_STATUSES,
  getAllBusinesses,
  findBusinessById,
  findBusinessesByOwnerId,
  findActiveBusinesses,
  addBusiness,
  updateBusiness,
  setBusinessStatus,
};
