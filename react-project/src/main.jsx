import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import './styles.css' // optional — if file exists

const root = createRoot(document.getElementById('root'))
root.render(<App />)
