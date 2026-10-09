import { Router } from "express";
import { requireAuth, requireConsumer } from "../middleware/auth.js";
import {
  getReservationById,
  cancelReservation,
} from "../controllers/reservationController.js";
import { getCollectionCode } from "../controllers/collectionController.js";
import { createReview } from "../controllers/reviewController.js";

const router = Router();

router.post("/:reservationId/cancel", requireConsumer, cancelReservation);
router.get("/:reservationId/collection-code", requireConsumer, getCollectionCode);
router.post("/:reservationId/review", requireConsumer, createReview);

// The controller permits the consumer or the owning business.
router.get("/:reservationId", requireAuth, getReservationById);

export default router;
