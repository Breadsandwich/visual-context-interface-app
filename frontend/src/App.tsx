import { Viewport } from './components/Viewport'
import { ControlPanel } from './components/ControlPanel'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Visual Context Interface</h1>
        <span className="app-version">v1.0.0</span>
      </header>
      <main className="app-main">
        <Viewport />
        <ControlPanel />
      </main>
    </div>
  )
}

export default App
