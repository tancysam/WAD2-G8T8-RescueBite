import Business from "../models/Business.js";
import Listing from "../models/Listing.js";
import Reservation from "../models/Reservation.js";

export async function createBusiness(req, res) {
  // creation of business
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Business details are required",
    });
  }

  const fields = {
    name: "name",
    description: "description",
    phone: "phone",
    address: "address",
    postalCode: "postal_code",
    pickupInstructions: "pickup_instructions",
  };

  const data = {};

  for (const field of Object.keys(fields)) {
    const required =
      field === "name" || field === "address" || field === "postalCode";

    if (body[field] === undefined && !required) {
      continue;
    }

    if (
      typeof body[field] !== "string" ||
      (required && body[field].trim() === "")
    ) {
      return res.status(400).json({
        error: field + " must be a valid string",
      });
    }

    data[fields[field]] = body[field].trim();
  }

  const location = body.location;

  if (
    !location ||
    typeof location !== "object" ||
    location.type !== "Point" ||
    !Array.isArray(location.coordinates) ||
    location.coordinates.length !== 2
  ) {
    return res.status(400).json({
      error: "location must contain Point coordinates [longitude, latitude]",
    });
  }

  const longitude = location.coordinates[0];
  const latitude = location.coordinates[1];

  if (
    typeof longitude !== "number" ||
    Number.isNaN(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof latitude !== "number" ||
    Number.isNaN(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return res.status(400).json({
      error: "Invalid longitude or latitude",
    });
  }

  data.location = { type: "Point", coordinates: [longitude, latitude] };
  data.owner_user_id = req.user._id;
  // I SET THIS TO ACTIVE ONLY FOR THE WEEK 9 DEMO BC ADMIN LOGIC IS NOT DEVELOPED YET
  // !!!!!!!!!!!!!!!!!!!!!
  // !!!!!!!!!!!!!!!!!!!!!!
  //data.status = "PENDING";
  data.status = "ACTIVE";
  // !!!!!!!!!!!!!!!!!!!!!
  // !!!!!!!!!!!!!!!!!!!!!!

  try {
    const business = await Business.addBusiness(data);

    return res.status(201).json({ business });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid business details",
      });
    }

    console.error("Failed to create business:", error);

    return res.status(500).json({
      error: "Unable to create business",
    });
  }
}

export async function getActiveBusinesses(req, res) {
  // get business
  try {
    const businesses = await Business.findActiveBusinesses();

    return res.status(200).json({ businesses });
  } catch (error) {
    console.error("Failed to get businesses:", error);

    return res.status(500).json({
      error: "Unable to get businesses",
    });
  }
}

export async function getBusinessById(req, res) {
  // get business based off of the id in the URL
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business || business.status !== "ACTIVE") {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    return res.status(200).json({ business });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get business:", error);

    return res.status(500).json({
      error: "Unable to get business",
    });
  }
}

export async function getBusinessByUserId(req, res) {
  // get business by user id
  try {
    const businesses = await Business.findBusinessesByOwnerId(req.user._id);

    return res.status(200).json({ businesses });
  } catch (error) {
    console.error("Failed to get owned businesses:", error);

    return res.status(500).json({
      error: "Unable to get your businesses",
    });
  }
}

export async function updateBusiness(req, res) {
  // update business info
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Business details are required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    const fields = {
      name: "name",
      description: "description",
      phone: "phone",
      address: "address",
      postalCode: "postal_code",
      pickupInstructions: "pickup_instructions",
    };

    const update = {};

    for (const field of Object.keys(fields)) {
      if (body[field] === undefined) {
        continue;
      }

      const required =
        field === "name" || field === "address" || field === "postalCode";

      if (
        typeof body[field] !== "string" ||
        (required && body[field].trim() === "")
      ) {
        return res.status(400).json({
          error: field + " must be a valid string",
        });
      }

      update[fields[field]] = body[field].trim();
    }

    if (body.location !== undefined) {
      const location = body.location;

      if (
        !location ||
        typeof location !== "object" ||
        location.type !== "Point" ||
        !Array.isArray(location.coordinates) ||
        location.coordinates.length !== 2
      ) {
        return res.status(400).json({
          error:
            "location must contain Point coordinates [longitude, latitude]",
        });
      }

      const longitude = location.coordinates[0];
      const latitude = location.coordinates[1];

      if (
        typeof longitude !== "number" ||
        Number.isNaN(longitude) ||
        longitude < -180 ||
        longitude > 180 ||
        typeof latitude !== "number" ||
        Number.isNaN(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        return res.status(400).json({
          error: "Invalid longitude or latitude",
        });
      }

      update.location = { type: "Point", coordinates: [longitude, latitude] };
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        error: "Provide at least one editable business field",
      });
    }

    const result = await Business.updateBusiness(business._id, update);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    return res.status(200).json({
      message: "Business updated successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to update business:", error);

    return res.status(500).json({
      error: "Unable to update business",
    });
  }
}

export async function deleteBusiness(req, res) {
  // delete business
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    const result = await Business.setBusinessStatus(business._id, "INACTIVE");

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    return res.status(200).json({
      message: "Business deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to delete business:", error);

    return res.status(500).json({
      error: "Unable to delete business",
    });
  }
}

// Flat estimate of food weight per unit rescued (listings do not store weight)
const KG_PER_UNIT = 0.5;

export async function getBusinessImpact(req, res) {
  // get impact from collected reservations for this business
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    if (business.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: "You do not own this business",
      });
    }

    const collected = await Reservation.findCollectedReservationsByBusiness(
      business._id,
    );

    let units = 0;
    let revenue = 0;
    let savings = 0;

    for (const reservation of collected) {
      const snapshot = reservation.listing_snapshot;

      units = units + reservation.quantity;
      revenue = revenue + reservation.quantity * snapshot.rescue_unit_price_sgd;
      savings =
        savings +
        reservation.quantity *
          (snapshot.original_unit_price_sgd - snapshot.rescue_unit_price_sgd);
    }

    return res.status(200).json({
      impact: {
        reservationsCollected: collected.length,
        mealsRescued: units,
        estimatedKgSaved: Number((units * KG_PER_UNIT).toFixed(1)),
        revenueSgd: Number(revenue.toFixed(2)),
        customerSavingsSgd: Number(savings.toFixed(2)),
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    console.error("Failed to get business impact:", error);

    return res.status(500).json({
      error: "Unable to get business impact",
    });
  }
}
