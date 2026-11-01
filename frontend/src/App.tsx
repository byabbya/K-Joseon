import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CheckPage } from './pages/CheckPage'
import { LegalDetailPage } from './pages/LegalDetailPage'
import { LegalListPage } from './pages/LegalListPage'
import { MyChecksPage } from './pages/MyChecksPage'

/** 예전 경로 (/request/:id, 대화형 /c/:id) → /check/:id */
function LegacyRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/check/${encodeURIComponent(id)}` : '/check'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/check" replace />} />
        {/* 사원 — 반출 전 저촉 여부 확인 */}
        <Route path="/check" element={<CheckPage />} />
        <Route path="/check/:id" element={<CheckPage />} />
        <Route path="/history" element={<MyChecksPage />} />
        {/* 법무팀 — 확인 요청 목록 */}
        <Route path="/legal" element={<LegalListPage />} />
        <Route path="/legal/:id" element={<LegalDetailPage />} />
        {/* 예전 경로 */}
        <Route path="/request" element={<Navigate to="/check" replace />} />
        <Route path="/request/:id" element={<LegacyRedirect />} />
        <Route path="/c/:id" element={<LegacyRedirect />} />
        <Route path="/my" element={<Navigate to="/history" replace />} />
        <Route path="*" element={<Navigate to="/check" replace />} />
      </Route>
    </Routes>
  )
}
