import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import ImageGenerator from './ImageGenerator'
import ErrorBoundary from './ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/image-generator" element={<ImageGenerator />} />
          <Route path="/" element={<Navigate to="/image-generator" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  )
}

export default App

