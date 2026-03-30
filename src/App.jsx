import React from "react";
import "./App.css";
import { CssBaseline } from "@mui/material";
import Header from "./components/Header"; // Make sure this path is correct
import Performance from "./pages/Performance";
import ActivitiesPage from "./pages/ActivitiesPage";
import Settings from "./pages/Settings";
import Broker from "./pages/Broker";
import BrokerUpload from "./pages/BrokerUpload";
import Login from "./pages/Login"; // Assuming your LoginPage component is named Login
import SignUp from "./pages/Signup";
import Holdings from "./pages/Holdings";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import PricingPage from "./pages/PricingPage";
import FeaturesPage from "./pages/FeaturesPage";
import { useAuth } from "./contexts/AuthContext";
import { useTheme } from "./contexts/ThemeContext"; // Assuming you have this for theme mode

import Reports from "./pages/Reports";
import ReportRoutes from "./pages/ReportRoutes";

// Placeholder components for other pages
const IncomePage = () => <div>Income Page</div>;

function App() {
  const { isAuthenticated } = useAuth();
  const { mode } = useTheme(); // Assuming this provides 'light' or 'dark'

  return (
    <Router>
      <CssBaseline />
      {/* Apply the mode class to the root app div */}
      <div className={`app ${mode}-mode`}>
        {/* Conditionally render the Header if the user is authenticated */}
        {isAuthenticated && <Header />}

        {/* The main content area */}
        <div className="content">
          <Routes>
            {/* Public routes */}
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/home" /> : <Login />}
            />
            <Route
              path="/signup"
              element={isAuthenticated ? <Navigate to="/home" /> : <SignUp />}
            />
            {/* These public pages might or might not want the header if accessed directly.
                Currently, they won't have it if not authenticated. If authenticated, they will.
                If you want them to *never* have the header, you'd need a more complex layout structure.
            */}
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/features" element={<FeaturesPage />} />

            {/* Landing page (only for non-authenticated users) */}
            <Route
              path="/"
              element={
                isAuthenticated ? <Navigate to="/home" /> : <LandingPage />
              }
            />

            {/* Protected routes - these will now all have the Header because isAuthenticated will be true */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/holdings"
              element={
                <ProtectedRoute>
                  <Holdings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/performance"
              element={
                <ProtectedRoute>
                  <Performance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/income"
              element={
                <ProtectedRoute>
                  <IncomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/activities"
              element={
                <ProtectedRoute>
                  <ActivitiesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brokers"
              element={
                <ProtectedRoute>
                  <Broker />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brokers/:brokerId"
              element={
                <ProtectedRoute>
                  <BrokerUpload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/*"
              element={
                <ProtectedRoute>
                  <ReportRoutes />
                </ProtectedRoute>
              }
            />

            {/* Admin routes - these will also have the Header */}
            <Route
              path="/admin/*"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />

            {/* Redirect any unmatched routes */}
            <Route
              path="*"
              element={<Navigate to={isAuthenticated ? "/home" : "/"} />}
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
