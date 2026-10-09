import { Router } from "express";
import { requireConsumer } from "../middleware/auth.js";
import { updateReview, deleteReview } from "../controllers/reviewController.js";

const router = Router();

router.use(requireConsumer);

router.patch("/:reviewId", updateReview);
router.delete("/:reviewId", deleteReview);

export default router;
