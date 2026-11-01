import { Router } from "express";
import { requireBusiness, requireConsumer } from "../middleware/auth.js";
import {
  getListingsByParams,
  getListingById,
  getBundleOptions,
  updateListing,
  deleteListing,
  generateListingSuggestions,
} from "../controllers/listingController.js";
import {
  createImageUploadUrl,
  addListingImage,
  deleteListingImage,
} from "../controllers/listingImageController.js";
import { createReservation } from "../controllers/reservationController.js";

const router = Router();

router.get("/", getListingsByParams);
router.post("/:listingId/reservations", requireConsumer, createReservation);
router.get("/:listingId/bundle-options", requireConsumer, getBundleOptions);
router.post("/:listingId/image-upload-url", requireBusiness, createImageUploadUrl);
router.post("/:listingId/images", requireBusiness, addListingImage);
router.delete("/:listingId/images/:imageId", requireBusiness, deleteListingImage);
router.post("/:listingId/ai-suggestions", requireBusiness, generateListingSuggestions);
router.get("/:listingId", getListingById);
router.patch("/:listingId", requireBusiness, updateListing);
router.delete("/:listingId", requireBusiness, deleteListing);

export default router;
