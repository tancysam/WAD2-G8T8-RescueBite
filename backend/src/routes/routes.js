import { Router } from "express";
import userRoutes from "./userRoutes.js";
import businessRoutes from "./businessRoutes.js";
import listingRoutes from "./listingRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import reservationRoutes from "./reservationRoutes.js";
import reviewRoutes from "./reviewRoutes.js";
import adminRoutes from "./adminRoutes.js";

const router = Router();

router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/businesses", businessRoutes);
router.use("/listings", listingRoutes);
router.use("/categories", categoryRoutes);
router.use("/reservations", reservationRoutes);
router.use("/reviews", reviewRoutes);


export default router;