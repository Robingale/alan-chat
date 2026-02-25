import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const container = document.getElementById('alex-chat-root')
if (container) {
  ReactDOM.createRoot(container).render(<App />)
}