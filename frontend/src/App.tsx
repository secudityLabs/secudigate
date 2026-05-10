import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import GeoGate from "./components/GeoGate";
import SiweGate from "./components/SiweGate";
import Home from "./pages/Home";
import Merchant from "./pages/Merchant";
import Freelancers from "./pages/Freelancers";
import Customize from "./pages/Customize";
import DepositLinks from "./pages/DepositLinks";
import Analytics from "./pages/Analytics";
import Webhooks from "./pages/Webhooks";
import Docs from "./pages/Docs";
import Pay from "./pages/Pay";
import Deposit from "./pages/Deposit";
import Security from "./pages/Security";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <GeoGate>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/merchant"                 element={<SiweGate><Merchant /></SiweGate>} />
          <Route path="/merchant/freelancers"     element={<SiweGate><Freelancers /></SiweGate>} />
          <Route path="/merchant/deposit-links"   element={<SiweGate><DepositLinks /></SiweGate>} />
          <Route path="/merchant/analytics"       element={<SiweGate><Analytics /></SiweGate>} />
          <Route path="/merchant/webhooks"        element={<SiweGate><Webhooks /></SiweGate>} />
          <Route path="/merchant/customize"       element={<SiweGate><Customize /></SiweGate>} />
          <Route path="/pay/:id" element={<Pay />} />
          <Route path="/deposit/:slug" element={<Deposit />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/security" element={<Security />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </GeoGate>
  );
}
