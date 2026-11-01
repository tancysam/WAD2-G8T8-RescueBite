const mongoose = require("mongoose");

const LISTING_TYPES = ["ITEM", "BUNDLE"];
const LISTING_STATUSES = ["DRAFT", "ACTIVE", "SOLD_OUT", "EXPIRED", "REMOVED"];

const bundleItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const listingSchema = new mongoose.Schema(
  {
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "business_id is required"],
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "category_id is required"],
    },
    listing_type: {
      type: String,
      required: [true, "listing_type is required"],
      enum: LISTING_TYPES,
    },
    title: {
      type: String,
      required: [true, "title is required"],
      trim: true,
    },
    description: {
      type: String,
    },
    bundle_contents: {
      type: [bundleItemSchema],
      default: [],
    },
    bundle_eligible: {
      type: Boolean,
      default: false,
    },
    original_price_sgd: {
      type: Number,
      required: [true, "original_price_sgd is required"],
    },
    rescue_price_sgd: {
      type: Number,
      required: [true, "rescue_price_sgd is required"],
    },
    quantity_available: {
      type: Number,
      required: [true, "quantity_available is required"],
    },
    collection_start_at: {
      type: Date,
      required: [true, "collection_start_at is required"],
    },
    collection_end_at: {
      type: Date,
      required: [true, "collection_end_at is required"],
    },
    status: {
      type: String,
      default: "DRAFT",
      enum: LISTING_STATUSES,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    images_purged_at: {
      type: Date,
      default: null,
    },
    restored_reservation_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

listingSchema.index({ business_id: 1, status: 1, collection_end_at: 1 });
listingSchema.index({ status: 1, category_id: 1, rescue_price_sgd: 1 });

const Listing = mongoose.model("Listing", listingSchema, "listings");

function getAllListings() {
  return Listing.find();
}

function findListingById(id) {
  return Listing.findOne({ _id: id });
}

function findListingsByBusiness(businessId) {
  return Listing.find({ business_id: businessId });
}

function findActiveListings(filters) {
  const filter = { status: "ACTIVE" };
  if (filters) {
    if (filters.category_id !== undefined) {
      filter.category_id = filters.category_id;
    }
    if (filters.min_price !== undefined || filters.max_price !== undefined) {
      filter.rescue_price_sgd = {};
      if (filters.min_price !== undefined) {
        filter.rescue_price_sgd.$gte = filters.min_price;
      }
      if (filters.max_price !== undefined) {
        filter.rescue_price_sgd.$lte = filters.max_price;
      }
    }
    if (filters.business_id !== undefined) {
      if (Array.isArray(filters.business_id)) {
        filter.business_id = { $in: filters.business_id };
      } else {
        filter.business_id = filters.business_id;
      }
    }
  }
  return Listing.find(filter);
}

function addListing(data) {
  return Listing.create(data);
}

function updateListing(id, update) {
  return Listing.updateOne({ _id: id }, update);
}

function setListingStatus(id, status) {
  return Listing.updateOne({ _id: id }, { status: status });
}

function removeListing(id) {
  return Listing.updateOne({ _id: id }, { status: "REMOVED" });
}

async function softDeleteListing(id) {
  const result = await Listing.updateOne({ _id: id }, { status: "REMOVED" });
  await Listing.updateOne(
    { _id: id, deleted_at: null },
    { deleted_at: new Date() },
  );
  return result;
}

function findCascadableListingsByBusiness(businessId) {
  return Listing.find({
    business_id: businessId,
    status: { $in: ["DRAFT", "ACTIVE", "SOLD_OUT", "EXPIRED"] },
  });
}

function findListingsPendingImagePurge(cutoff) {
  return Listing.find({
    status: "REMOVED",
    images_purged_at: null,
    collection_end_at: { $lte: cutoff },
  });
}

function markImagesPurged(id) {
  return Listing.updateOne({ _id: id }, { images_purged_at: new Date() });
}

function listingExistsForCategory(categoryId) {
  return Listing.exists({ category_id: categoryId });
}

// TODO: wrap stock reduction + reservation creation in a MongoDB transaction
// Conditional update so the stock reduction is atomic without a transaction.
function reduceStock(listingId, expectedQty, newQty, updatedAt) {
  const update = { quantity_available: newQty };
  if (newQty === 0) {
    update.status = "SOLD_OUT";
  }
  const filter = {
    _id: listingId,
    quantity_available: expectedQty,
    status: "ACTIVE",
    collection_end_at: { $gte: new Date(Number(new Date()) + 1) },
  };
  if (updatedAt !== undefined) filter.updated_at = updatedAt;
  return Listing.updateOne(filter, update);
}

// Retries the conditional update a few times in case of concurrent stock changes.
async function restoreStock(listingId, quantity, reservationId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const listing = await Listing.findOne({ _id: listingId });
    if (!listing) {
      return false;
    }
    const restoredIds = Array.isArray(listing.restored_reservation_ids)
      ? listing.restored_reservation_ids
      : [];
    if (
      reservationId !== undefined &&
      restoredIds.some(function (id) {
        return id.toString() === reservationId.toString();
      })
    ) {
      return true;
    }
    const update = {
      quantity_available: listing.quantity_available + quantity,
    };
    if (listing.status === "SOLD_OUT") {
      update.status = Number(listing.collection_end_at) > Number(new Date()) ? "ACTIVE" : "EXPIRED";
    }
    if (reservationId !== undefined) {
      update.restored_reservation_ids = restoredIds.slice();
      update.restored_reservation_ids.push(reservationId);
    }
    const filter = {
      _id: listingId,
      quantity_available: listing.quantity_available,
      status: listing.status,
    };
    if (listing.updated_at !== undefined) filter.updated_at = listing.updated_at;
    const result = await Listing.updateOne(filter, update);
    if (result.modifiedCount === 1) {
      return true;
    }
  }
  return false;
}

module.exports = {
  LISTING_TYPES,
  LISTING_STATUSES,
  getAllListings,
  findListingById,
  findListingsByBusiness,
  findActiveListings,
  addListing,
  updateListing,
  setListingStatus,
  removeListing,
  softDeleteListing,
  findCascadableListingsByBusiness,
  findListingsPendingImagePurge,
  markImagesPurged,
  listingExistsForCategory,
  reduceStock,
  restoreStock,
};
