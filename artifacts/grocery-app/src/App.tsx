import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/store";
import { BottomNav } from "@/components/layout/BottomNav";

// Pages
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Signup from "@/pages/resident/Signup";
import ResidentHome from "@/pages/resident/Home";
import ResidentOrder from "@/pages/resident/Order";
import ResidentCheckout from "@/pages/resident/Checkout";
import ResidentHistory from "@/pages/resident/History";
import VendorDashboard from "@/pages/vendor/Dashboard";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminPricing from "@/pages/admin/Pricing";
import RiderJobs from "@/pages/rider/Jobs";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, role } = useAuth();
  const [location, setLocation] = useLocation();

  if (!user || !role) {
    setLocation('/login');
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    setLocation('/');
    return null;
  }

  return <>{children}</>;
}

function RoleBasedRouter() {
  const { role } = useAuth();

  if (role === 'resident') {
    return (
      <Switch>
        <Route path="/" component={ResidentHome} />
        <Route path="/order" component={ResidentOrder} />
        <Route path="/checkout" component={ResidentCheckout} />
        <Route path="/history" component={ResidentHistory} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (role === 'vendor') {
    return (
      <Switch>
        <Route path="/" component={VendorDashboard} />
        <Route path="/call-orders" component={VendorDashboard} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (role === 'admin') {
    return (
      <Switch>
        <Route path="/" component={AdminDashboard} />
        <Route path="/pricing" component={AdminPricing} />
        <Route path="/call-log" component={AdminDashboard} />
        <Route path="/riders" component={AdminDashboard} />
        <Route path="/subscribers" component={AdminDashboard} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (role === 'rider') {
    return (
      <Switch>
        <Route path="/" component={RiderJobs} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return <Route component={NotFound} />;
}

function MainApp() {
  const { user, role } = useAuth();
  const isAuthRoute = ['/login', '/signup'].includes(useLocation()[0]);

  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route>
          <ProtectedRoute>
            <RoleBasedRouter />
          </ProtectedRoute>
        </Route>
      </Switch>
      {!isAuthRoute && user && role !== 'admin' && <BottomNav />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <MainApp />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
