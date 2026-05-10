import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import AuthBridge from "./components/AuthBridge";
import RainbowKitBridge from "./components/RainbowKitBridge";
import { ToastProvider } from "./components/Toast";
import { DialogProvider } from "./components/Dialog";
import { wagmiConfig } from "./lib/wagmi";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitBridge>
          <BrowserRouter>
            <ToastProvider>
              <DialogProvider>
                <AuthBridge />
                <App />
              </DialogProvider>
            </ToastProvider>
          </BrowserRouter>
        </RainbowKitBridge>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
