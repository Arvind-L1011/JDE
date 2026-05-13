import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PurchaseOrders from "./pages/PurchaseOrders";
import SalesOrders from "./pages/SalesOrders";
import Inventory from "./pages/Inventory";
import Suppliers from "./pages/Suppliers";
import Shipments from "./pages/Shipments";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import ExecutiveReport from "./pages/ExecutiveReport";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />      <Route path="/dashboard" component={Home} />      <Route path="/purchase-orders" component={PurchaseOrders} />
      <Route path="/sales-orders" component={SalesOrders} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/shipments" component={Shipments} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/assistant" component={Assistant} />
      <Route path="/settings" component={Settings} />
      <Route path="/executive-report" component={ExecutiveReport} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
