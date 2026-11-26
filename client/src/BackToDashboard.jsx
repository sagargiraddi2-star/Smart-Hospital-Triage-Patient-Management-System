import { Link } from 'react-router-dom';

// The standard "Back to Dashboard" button shown at the top of staff pages
// (styles: .triora-back-link in theme.css).
function BackToDashboard() {
  return (
    <Link to="/dashboard" className="triora-back-link">
      <span aria-hidden="true">←</span>
      Back to Dashboard
    </Link>
  );
}

export default BackToDashboard;
