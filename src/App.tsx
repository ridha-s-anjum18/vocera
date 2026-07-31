import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import VoiceRecorderPage from "@/pages/VoiceRecorderPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import AdminSessionsPage from "@/pages/AdminSessionsPage";
import AdminSessionDetailPage from "@/pages/AdminSessionDetailPage";
import RequireAdminAuth from "@/components/RequireAdminAuth";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/" element={<VoiceRecorderPage />} />
        <Route path="/login/admin" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdminAuth>
              <AdminSessionsPage />
            </RequireAdminAuth>
          }
        />
        <Route
          path="/admin/sessions/:sessionId"
          element={
            <RequireAdminAuth>
              <AdminSessionDetailPage />
            </RequireAdminAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
