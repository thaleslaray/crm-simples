import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { initTheme } from "./theme";
// Roboto (OFL, servida pelo próprio app): a mesma família de letra do WhatsApp Web.
import "@fontsource-variable/roboto";
import "./styles.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
