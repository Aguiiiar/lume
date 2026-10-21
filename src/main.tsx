import { createRoot } from "react-dom/client";
import App from "./App";
import PlayerOverlay from "./PlayerOverlay";
import "./style.css";
import "./onboarding.css";
const overlay = new URLSearchParams(location.search).has("player-overlay");
if (overlay) document.documentElement.classList.add("overlay-document");
createRoot(document.getElementById("root")!).render(
  overlay ? <PlayerOverlay /> : <App />,
);
