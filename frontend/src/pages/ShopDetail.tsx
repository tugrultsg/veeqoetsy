import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Tab = "overview" | "orders" | "logs" | "inventory";

export function ShopDetail() {
  const { id } = useParams();
  const shopId = parseInt(id || "0");
  const [shop, setShop] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [syncing, setSyncing] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const s = await api.getShop(shopId);
      setShop(s);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [shopId]);

  useEffect(() => {
    if (tab === "orders") api.getShopOrders(shopId).then(setOrders).catch(() => {});
    if (tab === "logs") api.getShopLogs(shopId).then(setLogs).catch(() => {});
    if (tab === "inventory") api.getShopInventory(shopId).then(setInventory).catch(() => {});
  }, [tab, shopId]);

  const handleSync = async (type: string) => {
    setSyncing(type);
    try {
      await api.triggerSync(shopId, type);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing("");
    }
  };

  const handleBuildMap = async () => {
    setSyncing("map");
    try {
      const result = await api.buildMap(shopId);
      alert(`Matched: ${result.matched}, Veeqo only: ${result.veeqoOnly}, Etsy only: ${result.etsyOnly}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing("");
    }
  };

  if (!shop) return <p className="text-gray-500">Loading...</p>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "orders", label: "Orders" },
    { key: "logs", label: "Sync Logs" },
    { key: "inventory", label: "SKU Map" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{shop.name}</h1>
          <p className="text-sm text-gray-500">Etsy Shop ID: {shop.etsyShopId || "N/A"}</p>
        </div>
        <div className="flex gap-2">
          {["orders", "shipping", "inventory"].map((type) => (
            <button
              key={type}
              onClick={() => handleSync(type)}
              disabled={!!syncing}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 disabled:opacity-50"
            >
              {syncing === type ? "Syncing..." : `Sync ${type}`}
            </button>
          ))}
          <button
            onClick={handleBuildMap}
            disabled={!!syncing}
            className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200 disabled:opacity-50"
          >
            {syncing === "map" ? "Building..." : "Rebuild SKU Map"}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Orders Synced" value={shop.orderCount} />
          <Stat label="Shipments Pushed" value={shop.shipmentCount} />
          <Stat label="SKU Mappings" value={shop.skuMapCount} />
          <Stat label="Token" value={shop.hasToken ? "Valid" : "Missing"} />
        </div>
      )}

      {/* Orders */}
      {tab === "orders" && (
        <table className="w-full bg-white rounded-lg border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2">Etsy Receipt</th>
              <th className="text-left px-4 py-2">Veeqo Order</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-2">{o.etsyReceiptId}</td>
                <td className="px-4 py-2">{o.veeqoOrderId || "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      o.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : o.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{new Date(o.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Logs */}
      {tab === "logs" && (
        <table className="w-full bg-white rounded-lg border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Summary</th>
              <th className="text-left px-4 py-2">Duration</th>
              <th className="text-left px-4 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2">{l.syncType}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      l.status === "success"
                        ? "bg-green-100 text-green-700"
                        : l.status === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{l.summary || l.errorMessage || "-"}</td>
                <td className="px-4 py-2 text-gray-500">{l.durationMs ? `${l.durationMs}ms` : "-"}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Inventory */}
      {tab === "inventory" && (
        <table className="w-full bg-white rounded-lg border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="text-left px-4 py-2">Etsy Listing</th>
              <th className="text-left px-4 py-2">Veeqo Sellable</th>
              <th className="text-left px-4 py-2">Last Stock</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-2 font-mono">{i.sku}</td>
                <td className="px-4 py-2">{i.etsyListingId || "-"}</td>
                <td className="px-4 py-2">{i.veeqoSellableId || "-"}</td>
                <td className="px-4 py-2">{i.lastSyncedStock ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
