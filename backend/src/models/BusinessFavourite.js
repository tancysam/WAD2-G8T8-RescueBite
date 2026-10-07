const mongoose = require("mongoose");

const businessFavouriteSchema = new mongoose.Schema(
  {
    consumer_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "consumer_user_id is required"],
    },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "business_id is required"],
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: false,
    },
  },
);

businessFavouriteSchema.index(
  { consumer_user_id: 1, business_id: 1 },
  { unique: true },
);

const BusinessFavourite = mongoose.model(
  "BusinessFavourite",
  businessFavouriteSchema,
  "business_favourites",
);

function findFavouritesByConsumer(consumerUserId) {
  return BusinessFavourite.find({
    consumer_user_id: consumerUserId,
  });
}

function findBusinessFavourite(consumerUserId, businessId) {
  return BusinessFavourite.findOne({
    consumer_user_id: consumerUserId,
    business_id: businessId,
  });
}

function addBusinessFavourite(consumerUserId, businessId) {
  return BusinessFavourite.create({
    consumer_user_id: consumerUserId,
    business_id: businessId,
  });
}

function removeBusinessFavourite(consumerUserId, businessId) {
  return BusinessFavourite.deleteOne({
    consumer_user_id: consumerUserId,
    business_id: businessId,
  });
}

module.exports = {
  findFavouritesByConsumer,
  findBusinessFavourite,
  addBusinessFavourite,
  removeBusinessFavourite,
};
