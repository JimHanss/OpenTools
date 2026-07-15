import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { initializeI18n } from './i18n'
import './styles.css'

await initializeI18n()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element was not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
