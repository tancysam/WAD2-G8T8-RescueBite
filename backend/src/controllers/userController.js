import User from "../models/User.js";
import Cascade from "../models/cascade.js";

export async function createMyProfile(req, res) {

  try {
    if (req.user) {
      return res.status(409).json({
        error: "Profile already exists",
      });
    }

    if (!req.body || typeof req.body.display_name !== "string") {
      return res.status(400).json({
        error: "display_name must be a string",
      });
    }

    const displayName = req.body.display_name.trim();

    if (displayName === "") {
      return res.status(400).json({
        error: "display_name is required",
      });
    }

    const role = req.body.role;
    if (role !== "CONSUMER" && role !== "BUSINESS") {
      return res.status(400).json({
        error: "role must be CONSUMER or BUSINESS",
      });
    }

    const user = await User.addUser({
      clerk_user_id: req.clerkUserId,
      display_name: displayName,
      role,
    });

    return res.status(201).json({ user });
  } catch (error) {
    // Handles two requests trying to create the same profile
    // 11000 is MongoDB's duplicate key error code
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Profile already exists",
      });
    }

    console.error("Failed to create profile:", error);

    return res.status(500).json({
      error: "Unable to create profile",
    });
  }
}

export async function getMyProfile(req, res) {
  // requireAuth has already fetched the profile from MongoDB.
  if (!req.user) {
    return res.status(404).json({
      error: "Profile not found",
    });
  }

  return res.status(200).json({
    user: req.user,
  });
}

export async function updateMyProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(404).json({
        error: "Profile not found",
      });
    }

    if (!req.body || typeof req.body.display_name !== "string") {
      return res.status(400).json({
        error: "display_name must be a string",
      });
    }

    const displayName = req.body.display_name.trim();

    if (displayName === "") {
      return res.status(400).json({
        error: "display_name is required",
      });
    }

    const result = await User.updateUser(req.user._id, {
      display_name: displayName,
    });

    // The profile could have been deleted after the middleware lookup.
    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Profile not found",
      });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Failed to update profile:", error);

    return res.status(500).json({
      error: "Unable to update profile",
    });
  }
}

export async function deleteMyProfile(req, res) {
  // delete profile
  try {
    if (!req.user) {
      return res.status(404).json({
        error: "Profile not found",
      });
    }

    if (req.user.role === "ADMIN") {
      return res.status(403).json({
        error: "Admin accounts cannot be deleted",
      });
    }

    const result = await Cascade.softDeleteUser(req.user);
    if (result.blocked) {
      return res.status(409).json({ error: result.error });
    }

    return res.status(200).json({
      message: "Profile deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete profile:", error);

    return res.status(500).json({
      error: "Unable to delete profile",
    });
  }
}


