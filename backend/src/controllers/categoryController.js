import Category from "../models/Category.js";

export async function getCategories(req, res) {
  // get all categories
  try {
    const categories = await Category.getActiveCategories();

    return res.status(200).json({ categories });
  } catch (error) {
    console.error("Failed to get categories:", error);

    return res.status(500).json({
      error: "Unable to get categories",
    });
  }
}
