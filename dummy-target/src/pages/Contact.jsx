import { useState } from "react";
import "./Contact.css";

function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Form submitted! (No actual validation)");
  };

  return (
    <div className="contact">
      <h1>Contact Us</h1>

      <div className="contact-content">
        <div className="contact-info">
          <h2>Get in Touch</h2>
          <p>
            We would love to hear from you. Send us a message and we will
            respond as soon as possible.
          </p>

          <div className="info-items">
            <div className="info-item">
              <span className="info-icon">📧</span>
              <span>hello@dummyapp.com</span>
            </div>
            <div className="info-item">
              <span className="info-icon">📱</span>
              <span>+1 (555) 123-4567</span>
            </div>
            <div className="info-item">
              <span className="info-icon">📍</span>
              <span>123 Demo Street, San Francisco, CA</span>
            </div>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="text"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Your message..."
              rows="5"
            />
          </div>

          <button type="submit" className="submit-button">
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}

export default Contact;
