import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import ListingImage from "../models/ListingImage.js";
import { generateToken } from "../utils/tokenUtils.js";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const UPLOAD_EXPIRY_SECONDS = 300;
let s3Client;

function isHexString(value, length) {
  if (typeof value !== "string" || value.length !== length) return false;
  for (const character of value) {
    if ("0123456789abcdef".indexOf(character) === -1) return false;
  }
  return true;
}

function imageExtension(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

function validImageKey(key, listingId, mimeType) {
  const prefix = "listings/" + listingId + "/";
  const extension = imageExtension(mimeType);
  if (!extension || typeof key !== "string" || key.indexOf(prefix) !== 0) return false;
  const token = key.slice(prefix.length, prefix.length + 64);
  return isHexString(token, 64) && key === prefix + token + extension;
}

async function ownedListing(req, res, allowRemoved) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (req.user.role !== "BUSINESS") {
    res.status(403).json({ error: "Business access required" });
    return null;
  }
  if (!req.params || !isHexString(req.params.listingId, 24)) {
    res.status(400).json({ error: "Invalid listing ID" });
    return null;
  }

  const listing = await Listing.findListingById(req.params.listingId);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return null;
  }
  const business = await Business.findBusinessById(listing.business_id);
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return null;
  }
  if (business.owner_user_id.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: "You do not own this listing" });
    return null;
  }
  if (!allowRemoved && listing.status === "REMOVED") {
    res.status(409).json({ error: "Removed listings cannot be updated" });
    return null;
  }
  return listing;
}

function imageStorage(res) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !bucket.trim() || !region || !region.trim()) {
    res.status(503).json({ error: "Image storage is not configured" });
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({ region, requestChecksumCalculation: "WHEN_REQUIRED" });
  }
  return { client: s3Client, bucket };
}

export async function createImageUploadUrl(req, res) {
  // upload listing image, create image upload
  try {
    const listing = await ownedListing(req, res, false);
    if (!listing) return;
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Image details are required" });
    }
    const extension = imageExtension(body.mimeType);
    if (!extension) {
      return res.status(400).json({ error: "mimeType must be image/jpeg, image/png or image/webp" });
    }
    if (!Number.isInteger(body.fileSize) || body.fileSize <= 0 || body.fileSize > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: "fileSize must be between 1 and 5242880 bytes" });
    }
    const storage = imageStorage(res);
    if (!storage) return;

    const listingId = listing._id.toString();
    const key = "listings/" + listingId + "/" + generateToken() + extension;
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: body.mimeType,
      ContentLength: body.fileSize,
      IfNoneMatch: "*",
      Metadata: { "listing-id": listingId, "owner-id": req.user._id.toString() },
    });
    const uploadUrl = await getSignedUrl(storage.client, command, {
      expiresIn: UPLOAD_EXPIRY_SECONDS,
      signableHeaders: new Set(["content-type", "content-length", "if-none-match"]),
    });

    return res.status(200).json({
      uploadUrl,
      s3ObjectKey: key,
      method: "PUT",
      headers: { "Content-Type": body.mimeType, "If-None-Match": "*" },
      fileSize: body.fileSize,
      expiresIn: UPLOAD_EXPIRY_SECONDS,
    });
  } catch (error) {
    console.error("Failed to create image upload URL");
    return res.status(500).json({ error: "Unable to create image upload URL" });
  }
}

export async function addListingImage(req, res) {
  // add listing image to listing
  try {
    const listing = await ownedListing(req, res, false);
    if (!listing) return;
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Image details are required" });
    }
    const listingId = listing._id.toString();
    if (!validImageKey(body.s3ObjectKey, listingId, body.mimeType)) {
      return res.status(400).json({ error: "Invalid image key or mimeType for this listing" });
    }
    const sortOrder = body.sortOrder === undefined ? 0 : body.sortOrder;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000000) {
      return res.status(400).json({ error: "sortOrder must be an integer between 0 and 1000000" });
    }
    const existing = await ListingImage.findImageByS3Key(body.s3ObjectKey);
    if (existing) {
      return res.status(409).json({ error: "Image is already attached to a listing" });
    }
    const storage = imageStorage(res);
    if (!storage) return;

    const uploaded = await storage.client.send(new HeadObjectCommand({
      Bucket: storage.bucket,
      Key: body.s3ObjectKey,
    }));
    if (
      uploaded.ContentType !== body.mimeType ||
      !Number.isInteger(uploaded.ContentLength) ||
      uploaded.ContentLength <= 0 ||
      uploaded.ContentLength > MAX_IMAGE_SIZE ||
      !uploaded.Metadata ||
      uploaded.Metadata["listing-id"] !== listingId ||
      uploaded.Metadata["owner-id"] !== req.user._id.toString()
    ) {
      return res.status(400).json({ error: "Uploaded image does not match the allowed type, size or ownership" });
    }

    const image = await ListingImage.addListingImage({
      listing_id: listing._id,
      s3_object_key: body.s3ObjectKey,
      mime_type: body.mimeType,
      sort_order: sortOrder,
    });
    return res.status(201).json({ image });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Image is already attached to a listing" });
    }
    if (error.name === "NotFound" || error.name === "NoSuchKey") {
      return res.status(409).json({ error: "Upload the image before attaching it to the listing" });
    }
    console.error("Failed to add listing image");
    return res.status(500).json({ error: "Unable to add listing image" });
  }
}

export async function deleteListingImage(req, res) {
  // delete listing image
  try {
    const listing = await ownedListing(req, res, true);
    if (!listing) return;
    if (!isHexString(req.params.imageId, 24)) {
      return res.status(400).json({ error: "Invalid image ID" });
    }
    const images = await ListingImage.findImagesByListing(listing._id);
    const image = images.find((item) => item._id.toString() === req.params.imageId);
    if (!image) {
      return res.status(404).json({ error: "Image not found for this listing" });
    }
    if (!validImageKey(image.s3_object_key, listing._id.toString(), image.mime_type)) {
      return res.status(409).json({ error: "Image storage key does not match this listing" });
    }
    const storage = imageStorage(res);
    if (!storage) return;

    await storage.client.send(new DeleteObjectCommand({
      Bucket: storage.bucket,
      Key: image.s3_object_key,
    }));
    const result = await ListingImage.deleteListingImage(image._id);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Image not found" });
    }
    return res.status(200).json({ message: "Listing image deleted successfully" });
  } catch (error) {
    console.error("Failed to delete listing image");
    return res.status(500).json({ error: "Unable to delete listing image" });
  }
}
