import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import ImageGenerator from './ImageGenerator'
import ErrorBoundary from './ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import AuthCallback from './components/AuthCallback'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/v1/verify" element={<AuthCallback />} />
            <Route
              path="/image-generator"
              element={
                <ProtectedRoute>
                  <ImageGenerator />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/image-generator" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App

