import { Router } from "express";
import { requireAuth, requireConsumer } from "../middleware/auth.js";
import {
  getReservationById,
  cancelReservation,
  createBundleReservation,
} from "../controllers/reservationController.js";
import { getCollectionCode } from "../controllers/collectionController.js";
import { createReview } from "../controllers/reviewController.js";
import { resumeCheckout } from "../controllers/paymentController.js";

const router = Router();

router.post("/checkout", requireConsumer, resumeCheckout);
router.post("/bundle", requireConsumer, createBundleReservation);
router.post("/:reservationId/cancel", requireConsumer, cancelReservation);
router.get("/collection-code", requireConsumer, getCollectionCode);
router.post("/:reservationId/review", requireConsumer, createReview);

// The controller permits the consumer or the owning business.
router.get("/:reservationId", requireAuth, getReservationById);

export default router;
