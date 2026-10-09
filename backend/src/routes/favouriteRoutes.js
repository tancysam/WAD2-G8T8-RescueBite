import { Router } from "express";
import { requireConsumer } from "../middleware/auth.js";
import {
  getFavouriteBusinesses,
  addFavouriteBusiness,
  removeFavouriteBusiness,
  getFavouriteListings,
  addFavouriteListing,
  removeFavouriteListing,
} from "../controllers/favouriteController.js";

const router = Router();

router.use(requireConsumer);

router.get("/businesses", getFavouriteBusinesses);
router.put("/businesses/:businessId", addFavouriteBusiness);
router.delete("/businesses/:businessId", removeFavouriteBusiness);
router.get("/listings", getFavouriteListings);
router.put("/listings/:listingId", addFavouriteListing);
router.delete("/listings/:listingId", removeFavouriteListing);

export default router;
