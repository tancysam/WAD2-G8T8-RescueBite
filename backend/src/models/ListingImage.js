const mongoose = require("mongoose");

const listingImageSchema = new mongoose.Schema(
  {
    listing_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "listing_id is required"],
    },
    s3_object_key: {
      type: String,
      required: [true, "s3_object_key is required"], // this is the image retrieval from s3
      unique: true,
      trim: true,
    },
    mime_type: { type: String, required: [true, "mime_type is required"] }, // this means the image type information
    sort_order: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

listingImageSchema.index({ listing_id: 1, sort_order: 1 });

const ListingImage = mongoose.model(
  "ListingImage",
  listingImageSchema,
  "listing_images",
);

async function findImagesByListing(listingId) {
  const images = await ListingImage.find({ listing_id: listingId });
  images.sort((a, b) => a.sort_order - b.sort_order);
  return images;
}

function findImageByS3Key(s3ObjectKey) {
  return ListingImage.findOne({ s3_object_key: s3ObjectKey });
}

function addListingImage(data) {
  return ListingImage.create(data);
}

function updateImageSortOrder(id, sortOrder) {
  return ListingImage.updateOne({ _id: id }, { sort_order: sortOrder });
}

function deleteListingImage(id) {
  return ListingImage.deleteOne({ _id: id });
}

module.exports = {
  findImagesByListing,
  findImageByS3Key,
  addListingImage,
  updateImageSortOrder,
  deleteListingImage,
};
