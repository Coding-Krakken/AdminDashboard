import express from "express";
import { createDashboard } from "@universal-admin/core";
import { createEnvAuthAdapter } from "@universal-admin/adapters";

const app = express();

const dashboard = await createDashboard({
  authAdapter: createEnvAuthAdapter(),
  config: "env:ADMIN_DASHBOARD_CONFIG"
});

app.get("/api/admin/model", async (_req, res) => {
  const model = await dashboard.buildModel({ activeRoute: "/admin" });
  res.json(model);
});

app.listen(3000, () => {
  console.log("Admin integration ready on :3000");
});
