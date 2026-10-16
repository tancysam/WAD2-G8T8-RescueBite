import Business from "../models/Business.js";
import Category from "../models/Category.js";
import Listing from "../models/Listing.js";
import Review from "../models/Review.js";
import Cascade from "../models/cascade.js";

export async function getBusinessesForAdmin(req, res) {
  // get businesses for admin
  const query = req.query;
  const status = query.status;

  if (
    status !== undefined &&
    status !== "PENDING" &&
    status !== "ACTIVE" &&
    status !== "REJECTED" &&
    status !== "INACTIVE"
  ) {
    return res.status(400).json({
      error: "Invalid business status",
    });
  }

  const pagination = { page: 1, limit: 20 };

  for (const field of ["page", "limit"]) {
    if (query[field] === undefined) {
      continue;
    }

    if (typeof query[field] !== "string" || query[field].trim() === "") {
      return res.status(400).json({
        error: field + " must be a positive integer",
      });
    }

    const value = Number(query[field]);

    if (
      !Number.isInteger(value) ||
      value < 1 ||
      (field === "page" && value > 1000000) ||
      (field === "limit" && value > 100)
    ) {
      return res.status(400).json({
        error: field + " is outside the supported range",
      });
    }

    pagination[field] = value;
  }

  try {
    const results = await Business.getAllBusinesses();
    const matches = [];

    for (const business of results) {
      if (status !== undefined && business.status !== status) {
        continue;
      }

      matches.push(business);
    }

    const start = (pagination.page - 1) * pagination.limit;
    const businesses = matches.slice(start, start + pagination.limit);

    pagination.total = matches.length;
    pagination.totalPages =
      (matches.length - (matches.length % pagination.limit)) / pagination.limit;

    if (matches.length % pagination.limit !== 0) {
      pagination.totalPages++;
    }

    return res.status(200).json({ businesses, pagination });
  } catch (error) {
    console.error("Failed to get businesses for admin:", error);

    return res.status(500).json({
      error: "Unable to get businesses for admin",
    });
  }
}

export async function updateBusinessStatus(req, res) {
  // update business status
  const id = req.params.businessId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Business ID is required",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Business status is required",
    });
  }

  if (
    body.status !== "ACTIVE" &&
    body.status !== "REJECTED" &&
    body.status !== "INACTIVE"
  ) {
    return res.status(400).json({
      error: "status must be ACTIVE, REJECTED or INACTIVE",
    });
  }

  try {
    const business = await Business.findBusinessById(id);

    if (!business) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    let result;
    if (body.status === "INACTIVE" || body.status === "REJECTED") {
      result = await Cascade.softDeleteBusiness(business._id, body.status, false);
    } else {
      result = await Business.setBusinessStatus(business._id, body.status);
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Business not found",
      });
    }

    return res.status(200).json({
      message: "Business status updated successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid business ID",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Invalid business status",
      });
    }

    console.error("Failed to update business status:", error);

    return res.status(500).json({
      error: "Unable to update business status",
    });
  }
}

export async function deleteListingAsAdmin(req, res) {
  // delete listing
  const id = req.params.listingId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Listing ID is required",
    });
  }

  try {
    const listing = await Listing.findListingById(id);

    if (!listing) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    const result = await Cascade.softDeleteListing(listing._id);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Listing not found",
      });
    }

    return res.status(204).end();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid listing ID",
      });
    }

    console.error("Failed to delete listing as admin:", error);

    return res.status(500).json({
      error: "Unable to delete listing as admin",
    });
  }
}

export async function deleteReviewAsAdmin(req, res) {
  // delete review
  const id = req.params.reviewId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Review ID is required",
    });
  }

  try {
    const review = await Review.findReviewById(id);

    if (!review) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    const result = await Review.deleteReview(review._id);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Review not found",
      });
    }

    return res.status(204).end();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid review ID",
      });
    }

    console.error("Failed to delete review as admin:", error);

    return res.status(500).json({
      error: "Unable to delete review as admin",
    });
  }
}

export async function getCategoriesForAdmin(req, res) {
  // get all categories for admin
  try {
    const categories = await Category.getAllCategories();

    return res.status(200).json({ categories });
  } catch (error) {
    console.error("Failed to get categories for admin:", error);

    return res.status(500).json({
      error: "Unable to get categories",
    });
  }
}

export async function updateCategoryArchived(req, res) {
  // archive or unarchive a category
  const id = req.params.categoryId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Category ID is required",
    });
  }

  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.archived !== "boolean"
  ) {
    return res.status(400).json({
      error: "archived must be a boolean",
    });
  }

  try {
    const category = await Category.findCategoryById(id);

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    await Category.setCategoryArchived(category._id, body.archived);

    return res.status(200).json({
      message: "Category updated successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    console.error("Failed to update category:", error);

    return res.status(500).json({
      error: "Unable to update category",
    });
  }
}

export async function deleteCategoryAsAdmin(req, res) {
  // delete category
  const id = req.params.categoryId || req.params.id;

  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({
      error: "Category ID is required",
    });
  }

  try {
    const category = await Category.findCategoryById(id);

    if (!category) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    const inUse = await Listing.listingExistsForCategory(category._id);

    if (inUse) {
      return res.status(409).json({
        error: "Category is in use; archive it instead",
      });
    }

    await Category.deleteCategory(category._id);

    return res.status(204).end();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    console.error("Failed to delete category as admin:", error);

    return res.status(500).json({
      error: "Unable to delete category as admin",
    });
  }
}
