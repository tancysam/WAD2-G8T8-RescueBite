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
    try {
      const result = await Reservation.cancelReservation(
        reservation._id,
        user._id,
      );
      if (result.modifiedCount === 1) {
        const restored = await Listing.restoreStock(
          reservation.listing_id,
          reservation.quantity,
          reservation._id,
        );
        if (restored) {
          await Reservation.clearStockRestorePending(reservation._id);
        }
      }
    } catch (error) {
      console.error(
        "Failed to cancel reservation during user deletion",
        reservation._id.toString(),
        error,
      );
    }
  }
  await ListingFavourite.removeFavouritesByConsumer(user._id);
  await BusinessFavourite.removeFavouritesByConsumer(user._id);
  return await User.anonymiseUser(user._id);
}

async function expireOverdueReservations() {
  const reservations = await Reservation.findOverdueReservations();
  for (const reservation of reservations) {
    try {
      const result = await Reservation.expireReservation(reservation._id);
      if (result.modifiedCount === 1) {
        const restored = await Listing.restoreStock(
          reservation.listing_id,
          reservation.quantity,
          reservation._id,
        );
        if (restored) {
          await Reservation.clearStockRestorePending(reservation._id);
        }
      }
    } catch (error) {
      console.error(
        "Failed to expire reservation",
        reservation._id.toString(),
        error,
      );
    }
  }
}

async function purgeRemovedListingImages() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const listings = await Listing.findListingsPendingImagePurge(cutoff);
  for (const listing of listings) {
    try {
      const result = await ListingImage.deleteImageObjectsForListing(
        listing._id.toString(),
      );
      if (!result.configured) {
        console.log(
          "Skipping image purge; storage is not configured for listing",
          listing._id.toString(),
        );
        return;
      }
      if (result.failedKeys.length > 0) {
        console.error(
          "Failed to delete some S3 objects for listing",
          listing._id.toString(),
          result.failedKeys,
        );
        continue;
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

async function reconcilePendingStockRestores() {
  const reservations = await Reservation.findPendingStockRestores();
  for (const reservation of reservations) {
    try {
      if (
        reservation.status !== "CANCELLED" &&
        reservation.status !== "EXPIRED"
      ) {
        console.error(
          "Stock restore pending on non-terminal reservation",
          reservation._id.toString(),
        );
        continue;
      }
      const restored = await Listing.restoreStock(
        reservation.listing_id,
        reservation.quantity,
        reservation._id,
      );
      if (restored) {
        await Reservation.clearStockRestorePending(reservation._id);
      } else {
        console.error(
          "Stock restoration still pending for reservation",
          reservation._id.toString(),
        );
      }
    } catch (error) {
      console.error(
        "Failed to reconcile stock for reservation",
        reservation._id.toString(),
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
    await reconcilePendingStockRestores();
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
  reconcilePendingStockRestores,
  purgeRemovedListingImages,
  runCleanupSweep,
};
