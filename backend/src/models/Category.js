const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "name is required"],
    unique: true,
    trim: true,
  },
  slug: {
    type: String, // this is the url  version of the category name
    required: [true, "slug is required"],
    unique: true,
    trim: true,
  },
  archived_at: {
    type: Date,
    default: null,
  },
});

const Category = mongoose.model("Category", categorySchema, "categories");

function getAllCategories() {
  return Category.find();
}

function getActiveCategories() {
  return Category.find({ archived_at: null });
}

function findCategoryById(id) {
  return Category.findOne({ _id: id });
}

function findCategoryByName(name) {
  return Category.findOne({ name: name });
}

function findCategoryBySlug(slug) {
  return Category.findOne({ slug: slug });
}

function addCategory(data) {
  return Category.create(data);
}

function updateCategory(id, update) {
  return Category.updateOne({ _id: id }, update);
}

module.exports = {
  getAllCategories,
  getActiveCategories,
  findCategoryById,
  findCategoryByName,
  findCategoryBySlug,
  addCategory,
  updateCategory,
};
