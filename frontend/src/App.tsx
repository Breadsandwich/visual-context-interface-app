import { Viewport } from './components/Viewport'
import { InspectorOverlay } from './components/InspectorOverlay'
import './App.css'

function App() {
  return (
    <div className="app">
      <main className="app-main">
        <Viewport />
        <InspectorOverlay />
      </main>
    </div>
  )
}

export default App
