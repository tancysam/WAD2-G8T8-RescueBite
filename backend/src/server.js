import dotenv from "dotenv";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./config/db.js";
import routes from "./routes/routes.js";
import Cascade from "./models/cascade.js";
import cors from "cors"; // function so that the ports are the same across frontend and backend

dotenv.config({ path: "../.env" });

const server = express();

// function so that the ports are the same across frontend and backend
server.use(cors({
  origin: "http://localhost:5173"
}));

server.use(express.urlencoded({ extended: true }));
server.use(express.json());

server.use("/api", clerkMiddleware());
server.use("/api", routes);

function startServer() {
  const hostname = "localhost";
  const port = 8000;

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    
    // Cleanup for deletion
    let interval = Number(process.env.CLEANUP_INTERVAL_MS);
    if (!Number.isInteger(interval) || interval <= 0) {
      interval = 5 * 60 * 1000;
    }
    Cascade.runCleanupSweep();
    setInterval(Cascade.runCleanupSweep, interval);
  });
}

// Start listening only after MongoDB connects.
connectDB().then(startServer).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
