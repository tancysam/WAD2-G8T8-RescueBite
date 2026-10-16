import { Router } from "express";
import {
  requireAuth,
  requireBusiness,
  requireConsumer,
} from "../middleware/auth.js";
import {
  createMyProfile,
  deleteMyProfile,
  getMyProfile,
  updateMyProfile,
} from "../controllers/userController.js";
import { getBusinessByUserId } from "../controllers/businessController.js";
import { getMyReservations } from "../controllers/reservationController.js";
import favouriteRoutes from "./favouriteRoutes.js";

const router = Router();

router.post("/me", requireAuth, createMyProfile);
router.get("/me", requireAuth, getMyProfile);
router.patch("/me", requireAuth, updateMyProfile);
router.delete("/me", requireAuth, deleteMyProfile);
router.get("/me/businesses", requireBusiness, getBusinessByUserId);
router.get("/me/reservations", requireConsumer, getMyReservations);
router.use("/me/favourites", favouriteRoutes);

export default router;
