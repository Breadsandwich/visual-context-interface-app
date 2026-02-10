import "./Home.css";

function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1 className="hero-title">Welcome to DummyApp</h1>
        <p className="hero-subtitle">
          A sample application for testing the Visual Context Interface
        </p>
        <button className="cta-button">Get Started</button>
      </section>

      <section className="features">
        <h2>Our Features</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>Fast</h3>
            <p>Lightning quick performance for all your needs.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Secure</h3>
            <p>Enterprise-grade security built in from day one.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Responsive</h3>
            <p>Works beautifully on any device, any screen size.</p>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="stat-item">
          <span className="stat-number">10K+</span>
          <span className="stat-label">Users</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">99.9%</span>
          <span className="stat-label">Uptime</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">24/7</span>
          <span className="stat-label">Support</span>
        </div>
      </section>
    </div>
  );
}

export default Home;
