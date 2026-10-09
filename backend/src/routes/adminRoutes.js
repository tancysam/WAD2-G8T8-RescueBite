import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import {
  getBusinessesForAdmin,
  updateBusinessStatus,
  deleteListingAsAdmin,
  deleteReviewAsAdmin,
} from "../controllers/adminController.js";

const router = Router();

router.use(requireAdmin);

router.get("/businesses", getBusinessesForAdmin);
router.patch("/businesses/:businessId/status", updateBusinessStatus);
router.delete("/listings/:listingId", deleteListingAsAdmin);
router.delete("/reviews/:reviewId", deleteReviewAsAdmin);

export default router;
