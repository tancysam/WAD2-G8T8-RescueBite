const Business = require("./Business.js");
const BusinessFavourite = require("./BusinessFavourite.js");
const Listing = require("./Listing.js");
const ListingFavourite = require("./ListingFavourite.js");
const ListingImage = require("./ListingImage.js");
const Reservation = require("./Reservation.js");
const User = require("./User.js");

async function softDeleteListing(listingId) {
  const result = await Listing.softDeleteListing(listingId);
  await ListingFavourite.removeFavouritesByListing(listingId);
  return result;
}

async function softDeleteBusiness(businessId, status, markDeleted) {
  const result = await Business.setBusinessStatus(businessId, status);
  if (markDeleted) {
    await Business.markBusinessDeleted(businessId);
  }
  await BusinessFavourite.removeFavouritesByBusiness(businessId);
  const listings = await Listing.findCascadableListingsByBusiness(businessId);
  for (const listing of listings) {
    await softDeleteListing(listing._id);
  }
  return result;
}

async function softDeleteUser(user) {
  if (user.role === "BUSINESS") {
    const businesses = await Business.findBusinessesByOwnerId(user._id);
    for (const business of businesses) {
      await softDeleteBusiness(business._id, "INACTIVE", true);
    }
  }
  const reservations = await Reservation.findOpenReservationsByConsumer(
    user._id,
  );
  for (const reservation of reservations) {
    const result = await Reservation.cancelReservation(
      reservation._id,
      user._id,
    );
    if (result.modifiedCount === 1) {
      await Listing.restoreStock(reservation.listing_id, reservation.quantity);
    }
  }
  await ListingFavourite.removeFavouritesByConsumer(user._id);
  await BusinessFavourite.removeFavouritesByConsumer(user._id);
  return await User.anonymiseUser(user._id);
}

async function expireOverdueReservations() {
  const reservations = await Reservation.findOverdueReservations();
  for (const reservation of reservations) {
    const result = await Reservation.expireReservation(reservation._id);
    if (result.modifiedCount === 1) {
      await Listing.restoreStock(reservation.listing_id, reservation.quantity);
    }
  }
}

async function purgeRemovedListingImages() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const listings = await Listing.findListingsPendingImagePurge(cutoff);
  for (const listing of listings) {
    try {
      const ok = await ListingImage.deleteImageObjectsForListing(
        listing._id.toString(),
      );
      if (!ok) {
        console.log(
          "Skipping image purge; storage is not configured for listing",
          listing._id.toString(),
        );
        return;
      }
      await ListingImage.deleteImagesByListing(listing._id);
      await ListingFavourite.removeFavouritesByListing(listing._id);
      await Listing.markImagesPurged(listing._id);
    } catch (error) {
      console.error(
        "Failed to purge images for listing",
        listing._id.toString(),
        error,
      );
    }
  }
}

let running = false;

async function runCleanupSweep() {
  if (running) {
    return;
  }
  running = true;
  try {
    await expireOverdueReservations();
    await purgeRemovedListingImages();
  } catch (error) {
    console.error("Cleanup sweep failed:", error);
  } finally {
    running = false;
  }
}

module.exports = {
  softDeleteListing,
  softDeleteBusiness,
  softDeleteUser,
  expireOverdueReservations,
  purgeRemovedListingImages,
  runCleanupSweep,
};
