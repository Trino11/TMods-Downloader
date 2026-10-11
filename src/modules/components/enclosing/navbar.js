import 'bootstrap-icons/font/bootstrap-icons.css';
import './navbar.css';
import { NavLink } from "react-router-dom";
import categories from '../../categories';

function NavItem({ to, icon, label }) {
    return <li className="nav-item">
        <NavLink to={to} className="nav-link text-white">
            <i className={`bi ${icon}`}></i>
            {label}
        </NavLink>
    </li>
}

function Navbar() {
    return <div className="d-flex flex-column flex-shrink-0 p-3 text-white bg-dark" style={{ width: '280px' }}>
        <NavLink to="/" className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-white text-decoration-none">
            <svg className="bi me-2" width="40" height="32"><use href="#bootstrap"></use></svg>
            <span className="fs-4">TMods Loader</span>
        </NavLink>
        <hr />
        <ul className="nav nav-pills flex-column mb-auto">
            <NavItem to="/home" icon="bi-house-fill" label="Home" />
            {categories.map(category =>
                <NavItem key={category.id} to={`/${category.id}`} icon={category.icon} label={category.label} />
            )}
        </ul>
        <hr />
        <ul className="nav nav-pills flex-column">
            <NavItem to="/settings" icon="bi-gear-fill" label="Settings" />
        </ul>
    </div>
}

export default Navbar;
