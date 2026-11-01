import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { AnswerPage } from './pages/AnswerPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'

// 첫 화면 번들을 가볍게: 용어 위키와 법무팀 화면은 필요할 때 불러온다
const WikiPage = lazy(() => import('./pages/WikiPage'))
const LegalListPage = lazy(() => import('./pages/LegalListPage').then((m) => ({ default: m.LegalListPage })))
const LegalDetailPage = lazy(() => import('./pages/LegalDetailPage').then((m) => ({ default: m.LegalDetailPage })))

const page = (el: ReactNode) => <Suspense fallback={<Spinner className="mx-auto w-full max-w-page" />}>{el}</Suspense>

/** 예전 경로 (/request/:id, 대화형 /c/:id) → /check/:id */
function LegacyRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/check/${encodeURIComponent(id)}` : '/'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* 사원 — ① 첫 화면(질문 상자) → ②·③ 답변 화면(내 질문 + 답변) */}
        <Route index element={<HomePage />} />
        <Route path="/check/:id" element={<AnswerPage />} />
        <Route path="/history" element={<HistoryPage />} />
        {/* 법무팀 — 확인 요청 목록 */}
        <Route path="/legal" element={page(<LegalListPage />)} />
        <Route path="/legal/:id" element={page(<LegalDetailPage />)} />
        {/* 두 역할 공통 — 용어 위키 · 도면 기호 표준화 */}
        <Route path="/wiki" element={page(<WikiPage />)} />
        {/* 예전 경로 */}
        <Route path="/check" element={<Navigate to="/" replace />} />
        <Route path="/request" element={<Navigate to="/" replace />} />
        <Route path="/request/:id" element={<LegacyRedirect />} />
        <Route path="/c/:id" element={<LegacyRedirect />} />
        <Route path="/my" element={<Navigate to="/history" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
