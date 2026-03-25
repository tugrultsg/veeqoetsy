import { Hono } from "hono";
import { Env } from "../env";
import { authRoutes, authMiddleware } from "./auth";
import { oauthRoutes } from "./oauth";
import { setupRoutes } from "./setup";
import { customerRoutes } from "./customers";
import { shopRoutes } from "./shops";
import { dashboardRoutes } from "./dashboard";
import { syncRoutes } from "./sync";
import { veeqoProxyRoutes } from "./veeqo-proxy";

export const apiRoutes = new Hono<{ Bindings: Env }>();

// Public routes (no auth needed)
apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/oauth", oauthRoutes);
apiRoutes.route("/setup", setupRoutes);

// Protected routes (admin password session)
apiRoutes.use("/customers/*", authMiddleware);
apiRoutes.use("/shops/*", authMiddleware);
apiRoutes.use("/dashboard/*", authMiddleware);
apiRoutes.use("/sync/*", authMiddleware);
apiRoutes.use("/veeqo/*", authMiddleware);
apiRoutes.route("/customers", customerRoutes);
apiRoutes.route("/shops", shopRoutes);
apiRoutes.route("/dashboard", dashboardRoutes);
apiRoutes.route("/sync", syncRoutes);
apiRoutes.route("/veeqo", veeqoProxyRoutes);
