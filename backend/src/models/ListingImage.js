const mongoose = require("mongoose");
const {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} = require("@aws-sdk/client-s3");

let s3Client;

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

async function findImagesByListings(listingIds) {
  const images = await ListingImage.find({ listing_id: { $in: listingIds } });
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

function deleteImagesByListing(listingId) {
  return ListingImage.deleteMany({ listing_id: listingId });
}

async function deleteImageObjectsForListing(listingId) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !bucket.trim() || !region || !region.trim()) {
    return false;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: region,
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  const prefix = "listings/" + listingId + "/";
  let continuationToken;
  do {
    const listInput = { Bucket: bucket, Prefix: prefix };
    if (continuationToken !== undefined) {
      listInput.ContinuationToken = continuationToken;
    }
    const page = await s3Client.send(new ListObjectsV2Command(listInput));
    const objects = [];
    if (Array.isArray(page.Contents)) {
      for (const item of page.Contents) {
        objects.push({ Key: item.Key });
      }
    }
    if (objects.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }),
      );
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken !== undefined);
  return true;
}

module.exports = {
  findImagesByListing,
  findImagesByListings,
  findImageByS3Key,
  addListingImage,
  updateImageSortOrder,
  deleteListingImage,
  deleteImagesByListing,
  deleteImageObjectsForListing,
};
