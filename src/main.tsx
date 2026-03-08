import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { getCanonicalLoopbackUrl } from './lib/utils.ts'

const canonicalLoopbackUrl = import.meta.env.DEV ? getCanonicalLoopbackUrl() : null

if (canonicalLoopbackUrl) {
  window.location.replace(canonicalLoopbackUrl)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </StrictMode>,
  )
}
