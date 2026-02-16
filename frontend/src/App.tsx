import { Viewport } from './components/Viewport'
import { Toast } from './components/Toast'
import './App.css'

function App() {
  return (
    <div className="app">
      <main className="app-main">
        <Viewport />
      </main>
      <Toast />
    </div>
  )
}

export default App
