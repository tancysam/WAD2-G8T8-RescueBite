const mongoose = require("mongoose");

const listingFavouriteSchema = new mongoose.Schema(
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
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

listingFavouriteSchema.index(
  { consumer_user_id: 1, listing_id: 1 },
  { unique: true },
);

const ListingFavourite = mongoose.model(
  "ListingFavourite",
  listingFavouriteSchema,
  "listing_favourites",
);

function findFavouritesByConsumer(consumerUserId) {
  return ListingFavourite.find({ consumer_user_id: consumerUserId });
}

function findListingFavourite(consumerUserId, listingId) {
  return ListingFavourite.findOne({
    consumer_user_id: consumerUserId,
    listing_id: listingId,
  });
}

function addListingFavourite(consumerUserId, listingId) {
  return ListingFavourite.create({
    consumer_user_id: consumerUserId,
    listing_id: listingId,
  });
}

function removeListingFavourite(consumerUserId, listingId) {
  return ListingFavourite.deleteOne({
    consumer_user_id: consumerUserId,
    listing_id: listingId,
  });
}

function removeFavouritesByListing(listingId) {
  return ListingFavourite.deleteMany({ listing_id: listingId });
}

function removeFavouritesByConsumer(consumerUserId) {
  return ListingFavourite.deleteMany({ consumer_user_id: consumerUserId });
}

module.exports = {
  findFavouritesByConsumer,
  findListingFavourite,
  addListingFavourite,
  removeListingFavourite,
  removeFavouritesByListing,
  removeFavouritesByConsumer,
};
