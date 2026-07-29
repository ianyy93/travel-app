// @ts-nocheck
import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { proposeChangesLogic, refineLogic } from "./src/services/aiLogic";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // Request logger middleware for API debugging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
  });

  // API routes FIRST
  app.post(["/api/proposeChanges", "/api/proposeChanges/"], async (req, res) => {
    await proposeChangesLogic(req, res);
  });

  app.post(["/api/refineSuggestions", "/api/refineSuggestions/"], async (req, res) => {
    await refineLogic(req, res);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 404 handler to prevent unmatched API calls from falling through to Vite static middleware (which returns 405 for POST)
  app.all("/api/*", (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.url} - Endpoint not found`);
    res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

