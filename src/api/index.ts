import { Hono } from "hono";
import { Env } from "../env";
import { authRoutes, authMiddleware } from "./auth";
import { oauthRoutes } from "./oauth";
import { customerRoutes } from "./customers";
import { shopRoutes } from "./shops";
import { dashboardRoutes } from "./dashboard";
import { syncRoutes } from "./sync";
import { veeqoProxyRoutes } from "./veeqo-proxy";

export const apiRoutes = new Hono<{ Bindings: Env }>();

// Public routes
apiRoutes.route("/auth", authRoutes);

// OAuth callback must be public (Etsy redirects here)
apiRoutes.route("/oauth", oauthRoutes);

// Protected routes
apiRoutes.use("/*", authMiddleware);
apiRoutes.route("/customers", customerRoutes);
apiRoutes.route("/shops", shopRoutes);
apiRoutes.route("/dashboard", dashboardRoutes);
apiRoutes.route("/sync", syncRoutes);
apiRoutes.route("/veeqo", veeqoProxyRoutes);
