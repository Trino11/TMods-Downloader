import 'bootstrap-icons/font/bootstrap-icons.css';
import './navbar.css';
import { Outlet, NavLink } from "react-router-dom";

function Navbar(){
    return <>
        <div className="d-flex flex-column flex-shrink-0 p-3 text-white bg-dark" style={{ width: '280px' }}>
            <NavLink to="/" className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-white text-decoration-none">
                <svg className="bi me-2" width="40" height="32"><use href="#bootstrap"></use></svg>
                <span className="fs-4">TMods Loader</span>
            </NavLink>
            <hr />
            <ul className="nav nav-pills flex-column mb-auto">
                <li className="nav-item">
                    <NavLink to="/home" className="nav-link text-white" activeClassName="active" aria-current="page">
                        <i className="bi bi-house-fill"></i>
                        Home
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/mods" className="nav-link text-white" activeClassName="active" >
                        <i className="bi bi-hammer"></i>
                        Mods
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/schematics" className="nav-link text-white" activeClassName="active" >
                        <i className="bi bi-map-fill"></i>
                        Schematics
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/resourcepacks" className="nav-link text-white" activeClassName="active" >
                        <i className="bi bi-box-seam-fill"></i>
                        Resource packs
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/configs" className="nav-link text-white" activeClassName="active" >
                        <i className="bi bi-nut-fill"></i>
                        Configs
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/shaderpacks" className="nav-link text-white">
                        <i className="bi bi-tree-fill"></i>
                        Shaderpacks
                    </NavLink>
                </li>
            </ul>
        </div>
        <Outlet />
    </>
}

export default Navbar;