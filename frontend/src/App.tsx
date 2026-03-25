import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { AddShop } from "./pages/AddShop";
import { ShopDetail } from "./pages/ShopDetail";
import { Layout } from "./components/Layout";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddShop />} />
          <Route path="/shop/:id" element={<ShopDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
