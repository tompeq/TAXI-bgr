import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { AppShell } from "./components/AppShell";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const DriverDetailPage = lazy(() =>
  import("./pages/DriverDetailPage").then((module) => ({
    default: module.DriverDetailPage,
  })),
);
const DriversPage = lazy(() =>
  import("./pages/DriversPage").then((module) => ({
    default: module.DriversPage,
  })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const TariffsPage = lazy(() =>
  import("./pages/TariffsPage").then((module) => ({
    default: module.TariffsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const FinancePage = lazy(() =>
  import("./pages/FinancePage").then((module) => ({
    default: module.FinancePage,
  })),
);
const SupportPage = lazy(() =>
  import("./pages/SupportPage").then((module) => ({
    default: module.SupportPage,
  })),
);
const EngagementPage = lazy(() =>
  import("./pages/EngagementPage").then((module) => ({
    default: module.EngagementPage,
  })),
);
const ReputationPage = lazy(() =>
  import("./pages/ReputationPage").then((module) => ({
    default: module.ReputationPage,
  })),
);

function ProtectedRoutes() {
  const { session } = useAuth();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Suspense fallback={<div className="route-loading">Загрузка...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="drivers/:id" element={<DriverDetailPage />} />
            <Route path="tariffs" element={<TariffsPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="engagement" element={<EngagementPage />} />
            <Route path="reputation" element={<ReputationPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
