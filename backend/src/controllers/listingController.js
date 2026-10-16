import Listing from "../models/Listing.js";
import Business from "../models/Business.js";
import Category from "../models/Category.js";
import ListingImage from "../models/ListingImage.js";
import Cascade from "../models/cascade.js";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateFoodDescription } from "../services/aiService.js";
import { loadListingImages } from "./listingImageController.js";
// import aiService from "../services/aiService.js";

export async function createListing(req, res) {
  // creation of listing
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Listing details are required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    // The current model requires these fields even for drafts.
    const data = {
      business_id: business._id,
      status: "DRAFT",
      bundle_contents: [],
    };

    const fields = {
      categoryId: "category_id",
      listingType: "listing_type",
      title: "title",
      description: "description",
      originalPriceSgd: "original_price_sgd",
      rescuePriceSgd: "rescue_price_sgd",
      quantityAvailable: "quantity_available",
      collectionStartAt: "collection_start_at",
      collectionEndAt: "collection_end_at",
      bundleContents: "bundle_contents",
      status: "status",
    };

    for (const field of Object.keys(fields)) {
      if (body[field] !== undefined) {
        data[fields[field]] = body[field];
      }
    }

    if (
      body.status !== undefined &&
      body.status !== "DRAFT" &&
      body.status !== "ACTIVE" &&
      body.status !== "SOLD_OUT"
    ) {
      return res.status(400).json({
        error: "status must be DRAFT, ACTIVE or SOLD_OUT",
      });
    }

    if (data.listing_type !== "ITEM" && data.listing_type !== "BUNDLE") {
      return res.status(400).json({
        error: "listingType must be ITEM or BUNDLE",
      });
    }

    if (typeof data.title !== "string" || data.title.trim() === "") {
      return res.status(400).json({
        error: "title is required",
      });
    }

    data.title = data.title.trim();

    if (data.description !== undefined) {
      if (typeof data.description !== "string") {
        return res.status(400).json({
          error: "description must be a string",
        });
      }

      data.description = data.description.trim();
    }

    if (
      typeof data.category_id !== "string" ||
      data.category_id.trim() === ""
    ) {
      return res.status(400).json({
        error: "categoryId is required",
      });
    }

    const category = await Category.findCategoryById(data.category_id);

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    if (category.archived_at) {
      return res.status(400).json({
        error: "Category is archived",
      });
    }

    for (const field of [
      "original_price_sgd",
      "rescue_price_sgd",
      "quantity_available",
    ]) {
      const value = data[field];

      if (
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return res.status(400).json({
          error: field + " must be a number",
        });
      }

      const number = Number(value);

      if (number - number !== 0 || number < 0) {
        return res.status(400).json({
          error: field + " must be a non-negative number",
        });
      }

      data[field] = number;
    }

    if (!Number.isInteger(data.quantity_available)) {
      return res.status(400).json({
        error: "quantityAvailable must be an integer",
      });
    }

    if (data.original_price_sgd <= 0) {
      return res.status(400).json({
        error: "Original price must be greater than zero",
      });
    }

    if (data.rescue_price_sgd > data.original_price_sgd) {
      return res.status(400).json({
        error: "Rescue price must not exceed original price",
      });
    }

    for (const field of ["collection_start_at", "collection_end_at"]) {
      const value = data[field];

      if (!(value instanceof Date)) {
        if (
          typeof value !== "string" ||
          value.indexOf("T") !== 10 ||
          (value[value.length - 1] !== "Z" &&
            value[value.length - 6] !== "+" &&
            value[value.length - 6] !== "-")
        ) {
          return res.status(400).json({
            error: "Collection dates must be ISO timestamps with a timezone",
          });
        }
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({
          error: "Invalid collection date",
        });
      }

      data[field] = date;
    }

    if (data.collection_start_at >= data.collection_end_at) {
      return res.status(400).json({
        error: "Collection start must be before collection end",
      });
    }

    if (!Array.isArray(data.bundle_contents)) {
      return res.status(400).json({
        error: "bundleContents must be an array",
      });
    }

    const bundleContents = [];

    for (const item of data.bundle_contents) {
      if (
        !item ||
        typeof item.name !== "string" ||
        item.name.trim() === "" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "Each bundle item needs a name and a positive integer quantity",
        });
      }

      bundleContents.push({ name: item.name.trim(), quantity: item.quantity });
    }

    if (data.listing_type === "BUNDLE" && bundleContents.length === 0) {
      return res.status(400).json({
        error: "A bundle must contain at least one item",
      });
    }

    if (data.listing_type === "ITEM" && bundleContents.length > 0) {
      return res.status(400).json({
        error: "Individual items must not have bundleContents",
      });
    }

    data.bundle_contents = bundleContents;

    if (data.status === "ACTIVE") {
      if (business.status !== "ACTIVE") {
        return res.status(403).json({
          error: "Only an active business can publish listings",
        });
      }

      if (data.quantity_available <= 0) {
        return res.status(400).json({
          error: "Active listings must have stock",
        });
      }

      if (data.collection_end_at.getTime() <= Date.now()) {
        return res.status(400).json({
          error: "Active listings must have a future collection deadline",
        });
      }
    }

    if (data.status === "SOLD_OUT" && data.quantity_available !== 0) {
      return res.status(400).json({
        error: "Sold-out listings must have zero stock",
      });
    }

    const listing = await Listing.addListing(data);

    return res.status(201).json({ listing });
  } catch (error) {
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid listing details or category/business ID",
      });
    }

    console.error("Failed to create listing:", error);

    return res.status(500).json({
      error: "Unable to create listing",
    });
  }
}

export async function getListingsByParams(req, res) {
  // get listing based on category, price
  const query = req.query || {};

  let location = null;
  if (
    query.lat !== undefined ||
    query.lng !== undefined ||
    query.radiusKm !== undefined
  ) {
    if (query.lat === undefined || query.lng === undefined) {
      return res.status(400).json({ error: "lat and lng must be supplied together for location search" });
    }
    location = { radiusKm: 5 };
    for (const field of ["lat", "lng", "radiusKm"]) {
      if (field === "radiusKm" && query[field] === undefined) continue;
      if (typeof query[field] !== "string" || query[field].trim() === "") {
        return res.status(400).json({ error: field + " must be a number" });
      }
      const value = Number(query[field]);
      if (value - value !== 0) {
        return res.status(400).json({ error: field + " must be a finite number" });
      }
      if (field === "lat" && (value < -90 || value > 90)) {
        return res.status(400).json({ error: "lat must be between -90 and 90" });
      }
      if (field === "lng" && (value < -180 || value > 180)) {
        return res.status(400).json({ error: "lng must be between -180 and 180" });
      }
      if (field === "radiusKm" && (value <= 0 || value > 50)) {
        return res.status(400).json({ error: "radiusKm must be greater than 0 and at most 50" });
      }
      location[field] = value;
    }
  }

  const filters = {};

  if (query.categoryId !== undefined) {
    if (
      typeof query.categoryId !== "string" ||
      query.categoryId.trim() === ""
    ) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    filters.category_id = query.categoryId;
  }

  for (const field of ["minPrice", "maxPrice"]) {
    if (query[field] === undefined) {
      continue;
    }

    if (typeof query[field] !== "string" || query[field].trim() === "") {
      return res.status(400).json({
        error: field + " must be a non-negative number",
      });
    }

    const value = Number(query[field]);

    if (value - value !== 0 || value < 0) {
      return res.status(400).json({
        error: field + " must be a non-negative number",
      });
    }

    if (field === "minPrice") {
      filters.min_price = value;
    } else {
      filters.max_price = value;
    }
  }

  if (
    filters.min_price !== undefined &&
    filters.max_price !== undefined &&
    filters.min_price > filters.max_price
  ) {
    return res.status(400).json({
      error: "minPrice must not exceed maxPrice",
    });
  }

  let keyword = "";

  if (query.q !== undefined) {
    if (typeof query.q !== "string") {
      return res.status(400).json({
        error: "q must be a string",
      });
    }

    keyword = query.q.trim().toLowerCase();
  }

  const dates = {};

  for (const field of ["collectionFrom", "collectionTo"]) {
    const value = query[field];

    if (value === undefined) {
      continue;
    }

    if (
      typeof value !== "string" ||
      value.indexOf("T") !== 10 ||
      (value[value.length - 1] !== "Z" &&
        value[value.length - 6] !== "+" &&
        value[value.length - 6] !== "-")
    ) {
      return res.status(400).json({
        error: field + " must be an ISO timestamp with a timezone",
      });
    }

    dates[field] = new Date(value);

    if (Number.isNaN(dates[field].getTime())) {
      return res.status(400).json({
        error: "Invalid " + field,
      });
    }
  }

  if (
    dates.collectionFrom &&
    dates.collectionTo &&
    dates.collectionFrom >= dates.collectionTo
  ) {
    return res.status(400).json({
      error: "collectionFrom must be before collectionTo",
    });
  }

  const pagination = { page: 1, limit: 20 };

  for (const field of ["page", "limit"]) {
    if (query[field] === undefined) {
      continue;
    }

    if (typeof query[field] !== "string" || query[field].trim() === "") {
      return res.status(400).json({
        error: field + " must be a positive integer",
      });
    }

    const value = Number(query[field]);

    if (
      !Number.isInteger(value) ||
      value < 1 ||
      (field === "page" && value > 1000000) ||
      (field === "limit" && value > 100)
    ) {
      return res.status(400).json({
        error: field + " is outside the supported range",
      });
    }

    pagination[field] = value;
  }

  try {
    const businesses = location
      ? await Business.findNearbyActiveBusinesses(location.lat, location.lng, location.radiusKm)
      : await Business.findActiveBusinesses();
    const businessIds = [];
    const businessOrder = {};

    for (const business of businesses) {
      businessOrder[business._id.toString()] = businessIds.length;
      businessIds.push(business._id);
    }

    filters.business_id = businessIds;

    const results = await Listing.findActiveListings(filters);
    const matches = [];
    const now = Date.now();

    for (const listing of results) {
      if (
        !(listing.quantity_available > 0) ||
        !(Number(listing.collection_end_at) > now)
      ) {
        continue;
      }

      const description = listing.description || "";

      if (
        keyword !== "" &&
        listing.title.toLowerCase().indexOf(keyword) === -1 &&
        description.toLowerCase().indexOf(keyword) === -1
      ) {
        continue;
      }

      if (
        dates.collectionFrom &&
        !(Number(listing.collection_end_at) > dates.collectionFrom.getTime())
      ) {
        continue;
      }

      if (
        dates.collectionTo &&
        !(Number(listing.collection_start_at) < dates.collectionTo.getTime())
      ) {
        continue;
      }

      matches.push(listing);
    }

    if (location) {
      matches.sort((left, right) => {
        const order = businessOrder[left.business_id.toString()] - businessOrder[right.business_id.toString()];
        if (order !== 0) return order;
        const leftId = left._id.toString();
        const rightId = right._id.toString();
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      });
    }
    const start = (pagination.page - 1) * pagination.limit;
    const listings = matches.slice(start, start + pagination.limit);

    pagination.total = matches.length;
    pagination.totalPages =
      (matches.length - (matches.length % pagination.limit)) / pagination.limit;

    if (matches.length % pagination.limit !== 0) {
      pagination.totalPages++;
    }

    const listingsWithImages = await loadListingImages(listings, res);
    if (!listingsWithImages) return;
    return res.status(200).json({ listings: listingsWithImages, pagination });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    console.error("Failed to get listings:", error);

    return res.status(500).json({
      error: "Unable to get listings",
    });
  }
}

export async function getListingById(req, res) {
  // get listing based off of the id, in the params :id
  const id = req.params.listingId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Listing ID is required",
    });
  }

  try {
    const listing = await Listing.findListingById(id);

    if (
      !listing ||
      listing.status !== "ACTIVE" ||
      !(listing.quantity_available > 0) ||
      !(Number(listing.collection_end_at) > Date.now())
    ) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    const business = await Business.findBusinessById(listing.business_id);

    if (!business || business.status !== "ACTIVE") {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    const listingsWithImages = await loadListingImages([listing], res);
    if (!listingsWithImages) return;
    return res.status(200).json({ listing: listingsWithImages[0] });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid listing ID",
      });
    }

    console.error("Failed to get listing:", error);

    return res.status(500).json({
      error: "Unable to get listing",
    });
  }
}

export async function getBusinessListings(req, res) {
  // get business listings based off of the id
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business || business.status !== "ACTIVE") {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    const results = await Listing.findActiveListings({
      business_id: business._id,
    });

    const listings = [];
    const now = Date.now();

    for (const listing of results) {
      if (
        listing.quantity_available > 0 &&
        Number(listing.collection_end_at) > now
      ) {
        listings.push(listing);
      }
    }

    const listingsWithImages = await loadListingImages(listings, res);
    if (!listingsWithImages) return;
    return res.status(200).json({ listings: listingsWithImages });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get business listings:", error);

    return res.status(500).json({
      error: "Unable to get business listings",
    });
  }
}

export async function getManagedListings(req, res) {
  // get managed listings
  // This means that regardless of whether its active or inactive, this will return all, for when business wants to manage
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    const listings = await Listing.findListingsByBusiness(business._id);

    const listingsWithImages = await loadListingImages(listings, res);
    if (!listingsWithImages) return;
    return res.status(200).json({ listings: listingsWithImages });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get managed listings:", error);

    return res.status(500).json({
      error: "Unable to get managed listings",
    });
  }
}

export async function updateListing(req, res) {
  // update listing info
  const id = req.params.listingId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Listing ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Listing details are required",
    });
  }

  try {
    const listing = await Listing.findListingById(id);

    if (!listing) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    const business = await Business.findBusinessById(listing.business_id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this listing",
      });
    }

    if (listing.status === "REMOVED") {
      return res.status(409).json({
        error: "Removed listings cannot be updated",
      });
    }

    const data = {
      category_id: listing.category_id,
      listing_type: listing.listing_type,
      title: listing.title,
      description: listing.description,
      bundle_contents: listing.bundle_contents,
      original_price_sgd: listing.original_price_sgd,
      rescue_price_sgd: listing.rescue_price_sgd,
      quantity_available: listing.quantity_available,
      collection_start_at: listing.collection_start_at,
      collection_end_at: listing.collection_end_at,
      status: listing.status,
    };

    const update = {};

    const fields = {
      categoryId: "category_id",
      listingType: "listing_type",
      title: "title",
      description: "description",
      originalPriceSgd: "original_price_sgd",
      rescuePriceSgd: "rescue_price_sgd",
      quantityAvailable: "quantity_available",
      collectionStartAt: "collection_start_at",
      collectionEndAt: "collection_end_at",
      bundleContents: "bundle_contents",
      status: "status",
    };

    for (const field of Object.keys(fields)) {
      if (body[field] !== undefined) {
        data[fields[field]] = body[field];
        update[fields[field]] = body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: "Provide at least one editable listing field",
      });
    }

    if (
      body.status !== undefined &&
      body.status !== "DRAFT" &&
      body.status !== "ACTIVE" &&
      body.status !== "SOLD_OUT"
    ) {
      return res.status(400).json({
        error: "status must be DRAFT, ACTIVE or SOLD_OUT",
      });
    }

    if (data.listing_type !== "ITEM" && data.listing_type !== "BUNDLE") {
      return res.status(400).json({
        error: "listingType must be ITEM or BUNDLE",
      });
    }

    if (typeof data.title !== "string" || data.title.trim() === "") {
      return res.status(400).json({
        error: "title is required",
      });
    }

    data.title = data.title.trim();

    if (data.description !== undefined) {
      if (typeof data.description !== "string") {
        return res.status(400).json({
          error: "description must be a string",
        });
      }

      data.description = data.description.trim();
    }

    if (
      body.categoryId !== undefined &&
      (typeof body.categoryId !== "string" || body.categoryId.trim() === "")
    ) {
      return res.status(400).json({
        error: "categoryId must be a valid string",
      });
    }

    const category = await Category.findCategoryById(data.category_id);

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    if (
      data.category_id.toString() !== listing.category_id.toString() &&
      category.archived_at
    ) {
      return res.status(400).json({
        error: "Category is archived",
      });
    }

    for (const field of [
      "original_price_sgd",
      "rescue_price_sgd",
      "quantity_available",
    ]) {
      const value = data[field];

      if (
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return res.status(400).json({
          error: field + " must be a number",
        });
      }

      const number = Number(value);

      if (number - number !== 0 || number < 0) {
        return res.status(400).json({
          error: field + " must be a non-negative number",
        });
      }

      data[field] = number;
    }

    if (!Number.isInteger(data.quantity_available)) {
      return res.status(400).json({
        error: "quantityAvailable must be an integer",
      });
    }

    if (data.original_price_sgd <= 0) {
      return res.status(400).json({
        error: "Original price must be greater than zero",
      });
    }

    if (data.rescue_price_sgd > data.original_price_sgd) {
      return res.status(400).json({
        error: "Rescue price must not exceed original price",
      });
    }

    for (const field of ["collection_start_at", "collection_end_at"]) {
      const value = data[field];

      if (!(value instanceof Date)) {
        if (
          typeof value !== "string" ||
          value.indexOf("T") !== 10 ||
          (value[value.length - 1] !== "Z" &&
            value[value.length - 6] !== "+" &&
            value[value.length - 6] !== "-")
        ) {
          return res.status(400).json({
            error: "Collection dates must be ISO timestamps with a timezone",
          });
        }
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({
          error: "Invalid collection date",
        });
      }

      data[field] = date;
    }

    if (data.collection_start_at >= data.collection_end_at) {
      return res.status(400).json({
        error: "Collection start must be before collection end",
      });
    }

    if (!Array.isArray(data.bundle_contents)) {
      return res.status(400).json({
        error: "bundleContents must be an array",
      });
    }

    const bundleContents = [];

    for (const item of data.bundle_contents) {
      if (
        !item ||
        typeof item.name !== "string" ||
        item.name.trim() === "" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "Each bundle item needs a name and a positive integer quantity",
        });
      }

      bundleContents.push({ name: item.name.trim(), quantity: item.quantity });
    }

    if (data.listing_type === "BUNDLE" && bundleContents.length === 0) {
      return res.status(400).json({
        error: "A bundle must contain at least one item",
      });
    }

    if (data.listing_type === "ITEM" && bundleContents.length > 0) {
      return res.status(400).json({
        error: "Individual items must not have bundleContents",
      });
    }

    data.bundle_contents = bundleContents;

    if (data.status === "ACTIVE") {
      if (business.status !== "ACTIVE") {
        return res.status(403).json({
          error: "Only an active business can publish listings",
        });
      }

      if (data.quantity_available <= 0) {
        return res.status(400).json({
          error: "Active listings must have stock",
        });
      }

      if (data.collection_end_at.getTime() <= Date.now()) {
        return res.status(400).json({
          error: "Active listings must have a future collection deadline",
        });
      }
    }

    if (data.status === "SOLD_OUT" && data.quantity_available !== 0) {
      return res.status(400).json({
        error: "Sold-out listings must have zero stock",
      });
    }

    for (const field of Object.keys(update)) {
      update[field] = data[field];
    }

    const result = await Listing.updateListing(listing._id, update);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    return res.status(200).json({
      message: "Listing updated successfully",
    });
  } catch (error) {
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid listing details or category ID",
      });
    }

    console.error("Failed to update listing:", error);

    return res.status(500).json({
      error: "Unable to update listing",
    });
  }
}

export async function deleteListing(req, res) {
  // delete listing
  const id = req.params.listingId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Listing ID is required",
    });
  }

  try {
    const listing = await Listing.findListingById(id);

    if (!listing) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    const business = await Business.findBusinessById(listing.business_id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this listing",
      });
    }

    const result = await Cascade.softDeleteListing(listing._id);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    return res.status(200).json({
      message: "Listing deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid listing ID",
      });
    }

    console.error("Failed to delete listing:", error);

    return res.status(500).json({
      error: "Unable to delete listing",
    });
  }
}

export async function generateListingSuggestions(req, res) {
  // generate listing suggestions based on uploaded image, which will be
  // given to service AI
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "BUSINESS") {
    return res.status(403).json({ error: "Business access required" });
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "imageId is required" });
  }
  const ids = {
    listingId: req.params && req.params.listingId,
    imageId: body.imageId,
  };
  for (const field of Object.keys(ids)) {
    if (typeof ids[field] !== "string" || ids[field].length !== 24) {
      return res.status(400).json({ error: "Invalid " + field });
    }
    ids[field] = ids[field].toLowerCase();
    for (const character of ids[field]) {
      if ("0123456789abcdef".indexOf(character) === -1) {
        return res.status(400).json({ error: "Invalid " + field });
      }
    }
  }

  try {
    const listing = await Listing.findListingById(ids.listingId);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }
    const business = await Business.findBusinessById(listing.business_id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You do not own this listing" });
    }
    if (listing.status === "REMOVED") {
      return res.status(409).json({ error: "Removed listings cannot receive suggestions" });
    }
    const images = await ListingImage.findImagesByListing(listing._id);
    const image = images.find((item) => item._id.toString() === ids.imageId);
    if (!image) {
      return res.status(404).json({ error: "Image not found for this listing" });
    }
    if (
      image.mime_type !== "image/jpeg" &&
      image.mime_type !== "image/png" &&
      image.mime_type !== "image/webp"
    ) {
      return res.status(400).json({ error: "The image must be JPEG, PNG or WebP" });
    }
    if (
      typeof image.s3_object_key !== "string" ||
      image.s3_object_key.indexOf("listings/" + listing._id.toString() + "/") !== 0
    ) {
      return res.status(409).json({ error: "Image storage key does not match this listing" });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    if (!apiKey || !apiKey.trim()) {
      return res.status(503).json({ error: "AI suggestions are not configured" });
    }
    if (!region || !region.trim() || !bucket || !bucket.trim()) {
      return res.status(503).json({ error: "Image storage is not configured" });
    }

    const records = await Category.getAllCategories();
    const categories = [];
    for (const category of records) {
      categories.push({ id: category._id.toString(), name: category.name });
    }
    const imageUrl = await getSignedUrl(
      new S3Client({ region }),
      new GetObjectCommand({ Bucket: bucket, Key: image.s3_object_key }),
      { expiresIn: 300 },
    );
    const result = await generateFoodDescription(imageUrl, categories, listing.original_price_sgd);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(200).json({
      suggestions: result.suggestions,
      requiresReview: true,
    });
  } catch (error) {
    console.error("Failed to generate listing suggestions");
    return res.status(500).json({ error: "Unable to generate listing suggestions" });
  }
}
