import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProviderWrapper } from "./contexts/ThemeContext";
import "./theme.css"; // Import theme CSS first
import "./index.css"; // Then import index.css

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProviderWrapper>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProviderWrapper>
  </React.StrictMode>
);
  