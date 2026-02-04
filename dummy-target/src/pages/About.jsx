import './About.css'

function About() {
  return (
    <div className="about">
      <h1>About Us</h1>

      <section className="about-intro">
        <p>
          DummyApp is a sample application designed to demonstrate the Visual Context
          Interface tool. It contains intentional styling issues that can be identified
          and fixed using Claude Code.
        </p>
      </section>

      <section className="team">
        <h2>Our Team</h2>
        <div className="team-grid">
          <div className="team-member">
            <div className="avatar">👨‍💻</div>
            <h3>John Developer</h3>
            <p className="role">Lead Engineer</p>
          </div>
          <div className="team-member">
            <div className="avatar">👩‍🎨</div>
            <h3>Jane Designer</h3>
            <p className="role">UI/UX Lead</p>
          </div>
          <div className="team-member">
            <div className="avatar">👨‍💼</div>
            <h3>Bob Manager</h3>
            <p className="role">Product Manager</p>
          </div>
        </div>
      </section>

      <section className="values">
        <h2>Our Values</h2>
        <ul className="values-list">
          <li>
            <strong>Innovation</strong>
            <span>We push boundaries and explore new possibilities</span>
          </li>
          <li>
            <strong>Quality</strong>
            <span>We deliver excellence in everything we do</span>
          </li>
          <li>
            <strong>Collaboration</strong>
            <span>We work together to achieve great things</span>
          </li>
        </ul>
      </section>
    </div>
  )
}

export default About
