"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import 'bootstrap/dist/css/bootstrap.min.css';

export default function TopNav() {
  const pathname = usePathname();
  // Determine active tab based on pathname or query
  const isActive = (path: string) => {
    return pathname === path ? 'active' : '';
  };
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
      <div className="container">
        <Link href="/" className="navbar-brand">
          AIProofBuddy
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav">
            <li className="nav-item">
              <Link href="/" className={`nav-link ${isActive('/')}`}>
                <i className="bi bi-house-door me-1"></i>
                Home
              </Link>
            </li>
            <li className="nav-item">
              <Link href="/files" className={`nav-link ${isActive('/files')}`}>
                <i className="bi bi-folder me-1"></i>
                Uploaded Files
              </Link>
            </li>
            <li className="nav-item">
              <Link href="/export" className={`nav-link ${isActive('/export')}`}>
                <i className="bi bi-download me-1"></i>
                Export Result
              </Link>
            </li>
            <li className="nav-item">
              <Link href="/help" className={`nav-link ${isActive('/help')}`}>
                <i className="bi bi-info-circle me-1"></i>
                Help
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
} 