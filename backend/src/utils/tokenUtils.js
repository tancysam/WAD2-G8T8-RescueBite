// Create the random tokens for collections
import { randomBytes } from "node:crypto";

export function generateToken() {
  return randomBytes(32).toString("hex");
}