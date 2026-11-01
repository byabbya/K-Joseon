import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ChatPage } from './pages/ChatPage'
import { LegalDetailPage } from './pages/LegalDetailPage'
import { LegalListPage } from './pages/LegalListPage'

/** 예전 경로 /request/:id → /c/:id */
function LegacyRequestRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/c/${encodeURIComponent(id)}` : '/'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="/c/:requestId" element={<ChatPage />} />
        <Route path="/legal" element={<LegalListPage />} />
        <Route path="/legal/:id" element={<LegalDetailPage />} />
        {/* 예전 경로 */}
        <Route path="/request" element={<Navigate to="/" replace />} />
        <Route path="/request/:id" element={<LegacyRequestRedirect />} />
        <Route path="/my" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
