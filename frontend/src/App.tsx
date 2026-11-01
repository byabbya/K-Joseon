import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LegalDetailPage } from './pages/LegalDetailPage'
import { LegalListPage } from './pages/LegalListPage'
import { MyRequestsPage } from './pages/MyRequestsPage'
import { RequestPage } from './pages/RequestPage'

/** 예전 대화형 경로 /c/:id → /request/:id */
function LegacyChatRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/request/${encodeURIComponent(id)}` : '/request'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/request" replace />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/request/:id" element={<RequestPage />} />
        <Route path="/my" element={<MyRequestsPage />} />
        <Route path="/legal" element={<LegalListPage />} />
        <Route path="/legal/:id" element={<LegalDetailPage />} />
        {/* 예전 대화형 경로 */}
        <Route path="/c/:id" element={<LegacyChatRedirect />} />
        <Route path="*" element={<Navigate to="/request" replace />} />
      </Route>
    </Routes>
  )
}
