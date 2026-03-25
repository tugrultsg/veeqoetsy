import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Step = "customer" | "etsy" | "veeqo-config" | "done";

export function AddShop() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("customer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Customer step
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [veeqoApiKey, setVeeqoApiKey] = useState("");
  const [isNewCustomer, setIsNewCustomer] = useState(true);

  // Etsy step
  const [shopName, setShopName] = useState("");
  const [etsyApiKey, setEtsyApiKey] = useState("");
  const [connectedShopId, setConnectedShopId] = useState<number | null>(null);

  // Veeqo config step
  const [channels, setChannels] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<any[]>([]);
  const [channelId, setChannelId] = useState<number>(0);
  const [warehouseId, setWarehouseId] = useState<number>(0);
  const [deliveryMethodId, setDeliveryMethodId] = useState<number>(0);

  useEffect(() => {
    api.getCustomers().then(setCustomers).catch(() => {});
  }, []);

  // Step 1: Customer
  const handleCustomerSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (isNewCustomer) {
        if (!newCustomerName || !veeqoApiKey) {
          setError("Name and Veeqo API key required");
          return;
        }
        const customer = await api.createCustomer(newCustomerName, veeqoApiKey);
        setSelectedCustomerId(customer.id);
      }
      if (!selectedCustomerId && !isNewCustomer) {
        setError("Select a customer");
        return;
      }

      // Load Veeqo config for later
      const key = isNewCustomer ? veeqoApiKey : "";
      if (key) {
        const [ch, wh, dm] = await Promise.all([
          api.getVeeqoChannels(key),
          api.getVeeqoWarehouses(key),
          api.getVeeqoDeliveryMethods(key),
        ]);
        setChannels(ch);
        setWarehouses(wh);
        setDeliveryMethods(dm);
      }

      setStep("etsy");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Etsy OAuth
  const handleEtsyConnect = async () => {
    setError("");
    if (!shopName || !etsyApiKey) {
      setError("Shop name and Etsy API key required");
      return;
    }

    try {
      const { authUrl } = await api.startEtsyOAuth(
        selectedCustomerId!,
        etsyApiKey,
        shopName
      );

      // Open popup
      const popup = window.open(authUrl, "etsy-oauth", "width=600,height=700");

      // Listen for callback message
      const handler = (event: MessageEvent) => {
        if (event.data?.success && event.data?.shopId) {
          setConnectedShopId(event.data.shopId);
          setStep("veeqo-config");
          window.removeEventListener("message", handler);
        } else if (event.data?.error) {
          setError(event.data.error);
          window.removeEventListener("message", handler);
        }
      };
      window.addEventListener("message", handler);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Step 3: Veeqo config
  const handleConfigSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await api.updateShopConfig(connectedShopId!, {
        veeqoChannelId: channelId,
        veeqoWarehouseId: warehouseId,
        veeqoDeliveryMethodId: deliveryMethodId,
      });

      // Build SKU map
      await api.buildMap(connectedShopId!);
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Shop</h1>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Customer */}
      {step === "customer" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Step 1: Customer (Veeqo Account)</h2>

          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setIsNewCustomer(true)}
              className={`px-3 py-1 rounded text-sm ${isNewCustomer ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
            >
              New Customer
            </button>
            {customers.length > 0 && (
              <button
                onClick={() => setIsNewCustomer(false)}
                className={`px-3 py-1 rounded text-sm ${!isNewCustomer ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
              >
                Existing Customer
              </button>
            )}
          </div>

          {isNewCustomer ? (
            <>
              <input
                placeholder="Customer name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg mb-3"
              />
              <input
                placeholder="Veeqo API Key"
                value={veeqoApiKey}
                onChange={(e) => setVeeqoApiKey(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg mb-3"
                type="password"
              />
            </>
          ) : (
            <select
              value={selectedCustomerId || ""}
              onChange={(e) => setSelectedCustomerId(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg mb-3"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleCustomerSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Next"}
          </button>
        </div>
      )}

      {/* Step 2: Etsy */}
      {step === "etsy" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Step 2: Connect Etsy Shop</h2>
          <input
            placeholder="Shop display name"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg mb-3"
          />
          <input
            placeholder="Etsy API Key (keystring)"
            value={etsyApiKey}
            onChange={(e) => setEtsyApiKey(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg mb-3"
            type="password"
          />
          <button
            onClick={handleEtsyConnect}
            className="w-full bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600"
          >
            Connect Etsy
          </button>
          <p className="text-xs text-gray-500 mt-2">
            A popup will open. The customer must authorize the app on Etsy.
          </p>
        </div>
      )}

      {/* Step 3: Veeqo Config */}
      {step === "veeqo-config" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Step 3: Veeqo Configuration</h2>

          <label className="block text-sm text-gray-600 mb-1">Channel</label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg mb-3"
          >
            <option value={0}>Select channel...</option>
            {channels.map((ch: any) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>

          <label className="block text-sm text-gray-600 mb-1">Warehouse</label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg mb-3"
          >
            <option value={0}>Select warehouse...</option>
            {warehouses.map((wh: any) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>

          <label className="block text-sm text-gray-600 mb-1">Delivery Method</label>
          <select
            value={deliveryMethodId}
            onChange={(e) => setDeliveryMethodId(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg mb-3"
          >
            <option value={0}>Select delivery method...</option>
            {deliveryMethods.map((dm: any) => (
              <option key={dm.id} value={dm.id}>
                {dm.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleConfigSubmit}
            disabled={loading || !channelId || !warehouseId || !deliveryMethodId}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving & Building SKU Map..." : "Save & Build SKU Map"}
          </button>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <h2 className="text-xl font-semibold text-green-700 mb-2">Shop Connected!</h2>
          <p className="text-gray-600 mb-4">
            Sync will start automatically. Check the dashboard for status.
          </p>
          <button
            onClick={() => navigate("/")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
