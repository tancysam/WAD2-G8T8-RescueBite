import dotenv from "dotenv";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./config/db.js";
import routes from "./routes/routes.js";
import Cascade from "./models/cascade.js";
import { stripeWebhook } from "./controllers/paymentController.js";
import { startPaymentReconciliation } from "./services/paymentService.js";
import cors from "cors";

dotenv.config({ path: "../.env" });

const server = express();

const allowedOrigins = ["http://localhost:5173"];
const configuredOrigins = `${process.env.FRONTEND_URL || ""},${process.env.CORS_ORIGINS || ""}`;
for (const value of configuredOrigins.split(",")) {
  const origin = value.trim();
  if (origin && origin !== "*" && origin !== "null" && !allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
}

server.use(cors({
  origin: allowedOrigins
}));

server.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);
server.use(express.urlencoded({ extended: true }));
server.use(express.json());

server.use("/api", clerkMiddleware());
server.use("/api", routes);

function startServer() {
  const hostname = "0.0.0.0";
  const port = Number(process.env.PORT) || 8080;

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);

    // Cleanup for deletion
    let interval = Number(process.env.CLEANUP_INTERVAL_MS);
    if (!Number.isInteger(interval) || interval <= 0) {
      interval = 60 * 1000;
    }
    Cascade.runCleanupSweep();
    setInterval(Cascade.runCleanupSweep, interval);

    startPaymentReconciliation();
  });
}

// Start listening only after MongoDB connects.
connectDB().then(startServer).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
