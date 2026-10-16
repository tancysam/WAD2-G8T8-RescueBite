import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import {
  getBusinessesForAdmin,
  updateBusinessStatus,
  deleteListingAsAdmin,
  deleteReviewAsAdmin,
  getCategoriesForAdmin,
  updateCategoryArchived,
  deleteCategoryAsAdmin,
} from "../controllers/adminController.js";

const router = Router();

router.use(requireAdmin);

router.get("/businesses", getBusinessesForAdmin);
router.patch("/businesses/:businessId/status", updateBusinessStatus);
router.delete("/listings/:listingId", deleteListingAsAdmin);
router.delete("/reviews/:reviewId", deleteReviewAsAdmin);
router.get("/categories", getCategoriesForAdmin);
router.patch("/categories/:categoryId", updateCategoryArchived);
router.delete("/categories/:categoryId", deleteCategoryAsAdmin);

export default router;
