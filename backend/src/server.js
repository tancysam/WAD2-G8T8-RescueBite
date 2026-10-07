import dotenv from "dotenv";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./config/db.js";
import routes from "./routes/routes.js";

dotenv.config({ path: "../.env" });

const server = express();

server.use(express.urlencoded({ extended: true }));
server.use(express.json());

server.use("/api", clerkMiddleware());
server.use("/api", routes);

function startServer() {
  const hostname = "localhost";
  const port = 8000;

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

// Start listening only after MongoDB connects.
connectDB().then(startServer).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
