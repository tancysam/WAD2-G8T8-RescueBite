const mongoose = require("mongoose");

const USER_ROLES = ["CONSUMER", "BUSINESS", "ADMIN"];

const userSchema = new mongoose.Schema(
  {
    clerk_user_id: {
      type: String,
      required: [true, "clerk_user_id is required"],
      unique: true,
      trim: true,
    },
    display_name: {
      type: String,
      required: [true, "display_name is required"],
      trim: true,
    },
    role: {
      type: String,
      required: [true, "role is required"],
      enum: USER_ROLES,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const User = mongoose.model("User", userSchema, "users");

function findUserById(id) {
  return User.findOne({ _id: id });
}

function findUserByClerkId(clerkUserId) {
  return User.findOne({ clerk_user_id: clerkUserId });
}

function getAllUsers() {
  return User.find();
}

function addUser(data) {
  return User.create(data);
}

function updateUser(id, update) {
  return User.updateOne({ _id: id }, update);
}

function anonymiseUser(id) {
  return User.updateOne(
    { _id: id },
    {
      display_name: "Deleted user",
      clerk_user_id: "deleted:" + id.toString(),
      deleted_at: new Date(),
    },
  );
}

module.exports = {
  USER_ROLES,
  findUserById,
  findUserByClerkId,
  getAllUsers,
  addUser,
  updateUser,
  anonymiseUser,
};
