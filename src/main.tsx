import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StreamingHome from "./components/StreamingHome";
import "./fable-theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StreamingHome />
  </StrictMode>,
);
