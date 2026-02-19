import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Contact from './pages/Contact'
import Tasks from './pages/Tasks'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <nav className="nav">
          <div className="logo">DummyApp</div>
          <ul className="nav-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/tasks">Tasks</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>&copy; 2024 DummyApp. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
