import { Router } from "express";
import { requireBusiness } from "../middleware/auth.js";
import {
  createBusiness,
  getActiveBusinesses,
  getBusinessById,
  getBusinessByUserId,
  updateBusiness,
  deleteBusiness,
  getBusinessImpact,
} from "../controllers/businessController.js";
import {
  createListing,
  getBusinessListings,
  getManagedListings,
} from "../controllers/listingController.js";
import { getBusinessReservations } from "../controllers/reservationController.js";
import { verifyCollectionCode } from "../controllers/collectionController.js";
import { getBusinessReviews } from "../controllers/reviewController.js";

const router = Router();

router.get("/", getActiveBusinesses);
router.get("/ownedBusinesses", requireBusiness, getBusinessByUserId )
router.post("/", requireBusiness, createBusiness);
router.get("/:businessId/listings", getBusinessListings);
router.post("/:businessId/listings", requireBusiness, createListing);
router.get("/:businessId/managed-listings", requireBusiness, getManagedListings);
router.get("/:businessId/reservations", requireBusiness, getBusinessReservations);
router.post("/:businessId/collections/verify", requireBusiness, verifyCollectionCode);
router.get("/:businessId/reviews", getBusinessReviews);
router.get("/:businessId/impact", requireBusiness, getBusinessImpact);
router.get("/:businessId", getBusinessById);
router.patch("/:businessId", requireBusiness, updateBusiness);
router.delete("/:businessId", requireBusiness, deleteBusiness);

export default router;
