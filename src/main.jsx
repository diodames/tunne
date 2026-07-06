import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Tausta from "./App.jsx";
import Screener from "./pages/Screener.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Tausta />} />
        <Route path="/screener" element={<Screener />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
