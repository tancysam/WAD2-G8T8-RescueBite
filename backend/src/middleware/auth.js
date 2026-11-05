import { getAuth } from "@clerk/express";
import User from "../models/User.js";


// Boilerplate from Clerk; will edit
export async function requireAuth(req, res, next) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  req.clerkUserId = userId;

  const user = await User.findUserByClerkId(userId);
  req.user = user;
  next();
}

export async function requireBusiness(req, res, next) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  const user = await User.findUserByClerkId(userId);

  if (!user || user.role !== "BUSINESS") {
    return res.status(403).json({
      error: "Forbidden - Business access required",
    });
  }

  req.user = user;
  next();
}

export async function requireConsumer(req, res, next) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  const user = await User.findUserByClerkId(userId);

  if (!user || user.role !== "CONSUMER") {
    return res.status(403).json({
      error: "Forbidden - Consumer access required",
    });
  }

  req.user = user;
  next();
}

