import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LegalDetailPage } from './pages/LegalDetailPage'
import { LegalListPage } from './pages/LegalListPage'
import { MyRequestsPage } from './pages/MyRequestsPage'
import { RequestPage } from './pages/RequestPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/request" replace />} />
        <Route path="/request" element={<RequestPage />} />
        <Route path="/request/:id" element={<RequestPage />} />
        <Route path="/my" element={<MyRequestsPage />} />
        <Route path="/legal" element={<LegalListPage />} />
        <Route path="/legal/:id" element={<LegalDetailPage />} />
        <Route path="*" element={<Navigate to="/request" replace />} />
      </Route>
    </Routes>
  )
}
