import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './assets/index.css';
import App from './modules/App';
import { bridgeAdapter } from './modules/services/httpAdapter';
import { http } from './modules/services/node';

// Web requests go through the main process; the page has no network access of its own.
axios.defaults.adapter = bridgeAdapter(axios, http);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
