import { Viewport } from './components/Viewport'
import { InspectorOverlay } from './components/InspectorOverlay'
import { Toast } from './components/Toast'
import './App.css'

function App() {
  return (
    <div className="app">
      <main className="app-main">
        <Viewport />
        <InspectorOverlay />
      </main>
      <Toast />
    </div>
  )
}

export default App
