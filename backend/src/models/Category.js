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
});

const Category = mongoose.model("Category", categorySchema, "categories");

function getAllCategories() {
  return Category.find();
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

function deleteCategory(id) {
  return Category.deleteOne({ _id: id });
}

module.exports = {
  getAllCategories,
  findCategoryById,
  findCategoryByName,
  findCategoryBySlug,
  addCategory,
  updateCategory,
  deleteCategory,
};
