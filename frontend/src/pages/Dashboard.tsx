import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { SyncStatusCard } from "../components/SyncStatusCard";

export function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          to="/add"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Add Shop
        </Link>
      </div>

      {data.shops.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No shops connected yet.</p>
          <Link to="/add" className="text-blue-600 hover:underline">
            Add your first shop
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.shops.map((shop: any) => (
          <Link
            key={shop.id}
            to={`/shop/${shop.id}`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{shop.name}</h3>
                <p className="text-sm text-gray-500">{shop.customerName}</p>
              </div>
              {!shop.hasToken && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                  No Token
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <SyncStatusCard
                syncType="Orders"
                lastSyncAt={shop.lastLogs?.orders?.createdAt}
                status={shop.lastLogs?.orders?.status}
                expectedIntervalMin={5}
              />
              <SyncStatusCard
                syncType="Shipping"
                lastSyncAt={shop.lastLogs?.shipping?.createdAt}
                status={shop.lastLogs?.shipping?.status}
                expectedIntervalMin={10}
              />
              <SyncStatusCard
                syncType="Inventory"
                lastSyncAt={shop.lastLogs?.inventory?.createdAt}
                status={shop.lastLogs?.inventory?.status}
                expectedIntervalMin={30}
              />
            </div>

            <div className="flex gap-4 text-sm text-gray-600">
              <span>Orders (24h): {shop.stats24h.ordersCreated}</span>
              <span>Shipments: {shop.stats24h.shipmentsSynced}</span>
              {shop.stats24h.ordersFailed > 0 && (
                <span className="text-red-600">
                  Failed: {shop.stats24h.ordersFailed}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
