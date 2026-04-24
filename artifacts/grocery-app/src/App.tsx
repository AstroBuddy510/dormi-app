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
import AdminCallLog from "@/pages/admin/CallLog";
import AdminRiders from "@/pages/admin/Riders";
import AdminSubscribers from "@/pages/admin/Subscribers";
import AdminSettings from "@/pages/admin/Settings";
import AdminUsers from "@/pages/admin/Users";
import AdminCreateOrder from "@/pages/admin/CreateOrder";
import AdminDeliveryPartners from "@/pages/admin/DeliveryPartners";
import AdminComplaints from "@/pages/admin/Complaints";
import AdminFinance from "@/pages/admin/Finance";
import AdminEmployees from "@/pages/admin/Employees";
import AdminCatalogue from "@/pages/admin/Catalogue";
import AdminReports from "@/pages/admin/Reports";
import AdminPayouts from "@/pages/admin/Payouts";
import AdminRiderInbox from "@/pages/admin/RiderInbox";
import AdminVendorInbox from "@/pages/admin/VendorInbox";
import AdminNotifications from "@/pages/admin/Notifications";
import AgentDashboard from "@/pages/agent/Dashboard";
import AgentCreateOrder from "@/pages/agent/CreateOrder";
import AgentComplaints from "@/pages/agent/Complaints";
import AgentCallLog from "@/pages/agent/CallLog";
import AgentMessages from "@/pages/agent/Messages";
import ResidentMessages from "@/pages/resident/Messages";
import ResidentProfile from "@/pages/resident/Profile";
import RiderJobs from "@/pages/rider/Jobs";
import AccountantOverview from "@/pages/accountant/Overview";
import AccountantPayroll from "@/pages/accountant/Payroll";
import AccountantExpenses from "@/pages/accountant/Expenses";
import AccountantFloat from "@/pages/accountant/Float";

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
        <Route path="/messages" component={ResidentMessages} />
        <Route path="/profile" component={ResidentProfile} />
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
        <Route path="/call-log" component={AdminCallLog} />
        <Route path="/riders" component={AdminRiders} />
        <Route path="/subscribers" component={AdminSubscribers} />
        <Route path="/users" component={AdminUsers} />
        <Route path="/create-order" component={AdminCreateOrder} />
        <Route path="/delivery-partners" component={AdminDeliveryPartners} />
        <Route path="/complaints" component={AdminComplaints} />
        <Route path="/settings" component={AdminSettings} />
        <Route path="/finance" component={AdminFinance} />
        <Route path="/employees" component={AdminEmployees} />
        <Route path="/catalogue" component={AdminCatalogue} />
        <Route path="/reports" component={AdminReports} />
        <Route path="/payouts" component={AdminPayouts} />
        <Route path="/rider-messages" component={AdminRiderInbox} />
        <Route path="/vendor-inbox" component={AdminVendorInbox} />
        <Route path="/notifications" component={AdminNotifications} />
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

  if (role === 'accountant') {
    return (
      <Switch>
        <Route path="/" component={AccountantOverview} />
        <Route path="/payroll" component={AccountantPayroll} />
        <Route path="/expenses" component={AccountantExpenses} />
        <Route path="/float" component={AccountantFloat} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (role === 'agent') {
    return (
      <Switch>
        <Route path="/" component={AgentDashboard} />
        <Route path="/call-log" component={AgentCallLog} />
        <Route path="/create-order" component={AgentCreateOrder} />
        <Route path="/complaints" component={AgentComplaints} />
        <Route path="/messages" component={AgentMessages} />
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
