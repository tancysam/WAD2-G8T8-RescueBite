import BusinessFavourite from "../models/BusinessFavourite.js";
import ListingFavourite from "../models/ListingFavourite.js";
import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import { loadListingImages } from "./listingImageController.js";


// BUSINESS HERE
export async function getFavouriteBusinesses(req, res) {
  // get favourite businesses
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

  try {
    const favourites = await BusinessFavourite.findFavouritesByConsumer(
      req.user._id,
    );

    const businesses = [];


    // Need this because we need to check if the business is active
    for (const favourite of favourites) {
      const business = await Business.findBusinessById(favourite.business_id);

      if (business && business.status === "ACTIVE") {
        businesses.push(business);
      }
    }

    return res.status(200).json({ businesses });
  } catch (error) {
    console.error("Failed to get favourite businesses:", error);

    return res.status(500).json({
      error: "Unable to get favourite businesses",
    });
  }
}

export async function addFavouriteBusiness(req, res) {
  // add favourite business
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

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

    const favourite = await BusinessFavourite.findBusinessFavourite(
      req.user._id,
      business._id,
    );

    if (favourite) {
      return res.status(200).json({
        message: "Business is already in favourites",
      });
    }

    await BusinessFavourite.addBusinessFavourite(req.user._id, business._id);

    return res.status(201).json({
      message: "Business added to favourites",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    if (error.code === 11000) {
      return res.status(200).json({
        message: "Business is already in favourites",
      });
    }

    console.error("Failed to add favourite business:", error);

    return res.status(500).json({
      error: "Unable to add favourite business",
    });
  }
}

export async function removeFavouriteBusiness(req, res) {
  // remove favourite business
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const result = await BusinessFavourite.removeBusinessFavourite(
      req.user._id,
      id,
    );

    if (result.deletedCount === 0) {
      return res.status(200).json({
        message: "Business is not in favourites",
      });
    }

    return res.status(200).json({
      message: "Business removed from favourites",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to remove favourite business:", error);

    return res.status(500).json({
      error: "Unable to remove favourite business",
    });
  }
}


// LISTINGS HERE
export async function getFavouriteListings(req, res) {
  // get favourite listings
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

  try {
    const favourites = await ListingFavourite.findFavouritesByConsumer(
      req.user._id,
    );

    const listings = [];

    for (const favourite of favourites) {
      const listing = await Listing.findListingById(favourite.listing_id);

      if (
        !listing ||
        (listing.status !== "ACTIVE" && listing.status !== "SOLD_OUT") ||
        new Date(listing.collection_end_at).getTime() <= Date.now()
      ) {
        continue;
      }

      const business = await Business.findBusinessById(listing.business_id);

      if (business && business.status === "ACTIVE") {
        listings.push(listing);
      }
    }

    const listingsWithImages = await loadListingImages(listings, res);
    if (!listingsWithImages) return;
    return res.status(200).json({ listings: listingsWithImages });
  } catch (error) {
    console.error("Failed to get favourite listings:", error);

    return res.status(500).json({
      error: "Unable to get favourite listings",
    });
  }
}

export async function addFavouriteListing(req, res) {
  // add favourite listing
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

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
      (listing.status !== "ACTIVE" && listing.status !== "SOLD_OUT") ||
      new Date(listing.collection_end_at).getTime() <= Date.now()
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

    const favourite = await ListingFavourite.findListingFavourite(
      req.user._id,
      listing._id,
    );

    if (favourite) {
      return res.status(200).json({
        message: "Listing is already in favourites",
      });
    }

    await ListingFavourite.addListingFavourite(req.user._id, listing._id);

    return res.status(201).json({
      message: "Listing added to favourites",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid listing ID",
      });
    }

    if (error.code === 11000) {
      return res.status(200).json({
        message: "Listing is already in favourites",
      });
    }

    console.error("Failed to add favourite listing:", error);

    return res.status(500).json({
      error: "Unable to add favourite listing",
    });
  }
}

export async function removeFavouriteListing(req, res) {
  // remove favourite listing
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Consumer access required",
    });
  }

  const id = req.params.listingId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Listing ID is required",
    });
  }

  try {
    const result = await ListingFavourite.removeListingFavourite(
      req.user._id,
      id,
    );

    if (result.deletedCount === 0) {
      return res.status(200).json({
        message: "Listing is not in favourites",
      });
    }

    return res.status(200).json({
      message: "Listing removed from favourites",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid listing ID",
      });
    }

    console.error("Failed to remove favourite listing:", error);

    return res.status(500).json({
      error: "Unable to remove favourite listing",
    });
  }
}
