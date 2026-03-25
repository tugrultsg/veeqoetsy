import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Step = "customer" | "method" | "setup-link" | "veeqo-config" | "done";

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

  // Setup link
  const [shopName, setShopName] = useState("");
  const [setupUrl, setSetupUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Veeqo config (for after customer connects)
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
          setLoading(false);
          return;
        }
        const customer = await api.createCustomer(newCustomerName, veeqoApiKey);
        setSelectedCustomerId(customer.id);

        // Load Veeqo config
        const [ch, wh, dm] = await Promise.all([
          api.getVeeqoChannels(veeqoApiKey),
          api.getVeeqoWarehouses(veeqoApiKey),
          api.getVeeqoDeliveryMethods(veeqoApiKey),
        ]);
        setChannels(ch);
        setWarehouses(wh);
        setDeliveryMethods(dm);
      } else if (!selectedCustomerId) {
        setError("Select a customer");
        setLoading(false);
        return;
      }
      setStep("method");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate setup link
  const handleGenerateLink = async () => {
    setError("");
    if (!shopName) {
      setError("Shop name required");
      return;
    }
    setLoading(true);
    try {
      const result = await api.generateSetupLink(selectedCustomerId!, shopName);
      setSetupUrl(result.url);
      setStep("setup-link");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(setupUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Veeqo config (after customer has connected via setup link)
  const handleConfigSubmit = async (shopId: number) => {
    setError("");
    setLoading(true);
    try {
      await api.updateShopConfig(shopId, {
        veeqoChannelId: channelId,
        veeqoWarehouseId: warehouseId,
        veeqoDeliveryMethodId: deliveryMethodId,
      });
      await api.buildMap(shopId);
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
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
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
                <option key={c.id} value={c.id}>{c.name}</option>
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

      {/* Step 2: Choose method */}
      {step === "method" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Step 2: Connect Etsy Shop</h2>

          <input
            placeholder="Etsy shop display name"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg mb-4"
          />

          <button
            onClick={handleGenerateLink}
            disabled={loading || !shopName}
            className="w-full bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 mb-3"
          >
            {loading ? "Generating..." : "Generate Setup Link for Customer"}
          </button>
          <p className="text-xs text-gray-500">
            Creates a one-time link (24h valid). Send it to the customer - they'll connect their Etsy shop from their own computer.
          </p>
        </div>
      )}

      {/* Step 3: Setup link generated */}
      {step === "setup-link" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Setup Link Ready</h2>
          <p className="text-sm text-gray-600 mb-4">
            Send this link to the customer. They'll create an Etsy app and authorize it from their own computer. The link expires in 24 hours.
          </p>

          <div className="bg-gray-50 p-3 rounded-lg mb-4 break-all font-mono text-sm">
            {setupUrl}
          </div>

          <button
            onClick={copyLink}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 mb-3"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>

          <div className="border-t pt-4 mt-4">
            <h3 className="font-semibold text-sm mb-2">After the customer connects:</h3>
            <p className="text-sm text-gray-600 mb-3">
              Come back here and configure the Veeqo settings (channel, warehouse, delivery method) for this shop.
            </p>
            <button
              onClick={() => navigate("/")}
              className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
            >
              Go to Dashboard
            </button>
          </div>
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
