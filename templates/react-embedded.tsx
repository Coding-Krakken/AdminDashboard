import { useEffect, useMemo, useState } from "react";
import { createDashboard } from "@universal-admin/core";
import { createEnvAuthAdapter } from "@universal-admin/adapters";

const dashboardPromise = createDashboard({
  authAdapter: createEnvAuthAdapter(),
  config: "env:ADMIN_DASHBOARD_CONFIG"
});

export function AdminEmbeddedPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; route: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const dashboard = await dashboardPromise;
        const model = await dashboard.buildModel({ activeRoute: "/admin" });
        if (!cancelled) {
          setItems(model.shell.primaryNavigation.map((item) => ({ id: item.id, route: item.route })));
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard model.");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return <p>Loading admin dashboard...</p>;
    }

    if (error) {
      return <p>{error}</p>;
    }

    return (
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.id} - {item.route}
          </li>
        ))}
      </ul>
    );
  }, [error, items, loading]);

  return (
    <section>
      <h2>Admin Dashboard Navigation</h2>
      {content}
    </section>
  );
}
