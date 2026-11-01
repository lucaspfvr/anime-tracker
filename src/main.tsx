
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import StreamingHome from "./components/StreamingHome";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StreamingHome>
      <App />
    </StreamingHome>
  </StrictMode>
);