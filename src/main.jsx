import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const container = document.getElementById('alex-chat-root') || document.body
ReactDOM.createRoot(container).render(<App />)
```

**Step 3 — Rebuild and push:**
```
cd ~/alan-chat
npm run build
git add .
git commit -m "fix mounting"
git push