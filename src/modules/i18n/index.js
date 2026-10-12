import { useSyncExternalStore } from 'react';
import en from './locales/en';
import es from './locales/es';

// The app's own text in every language it speaks. Text written by mod and pack
// authors (names, descriptions, changelogs) is shown as is and never goes through here.
const messages = { en, es };

// `name` is how each language calls itself, so a player can always find their own.
export const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
];

export const DEFAULT_LANGUAGE = 'en';

// Kept with the other settings in localStorage (see services/settings.js).
const LANGUAGE_KEY = 'tmods.language';

function isSupported(code) {
    return Object.hasOwn(messages, code);
}

// The system language when the app speaks it ("es-MX" counts as "es"), else English.
export function systemLanguage() {
    const preferred = typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language];
    for (const tag of preferred) {
        const code = String(tag || '')
            .toLowerCase()
            .split('-')[0];
        if (isSupported(code)) {
            return code;
        }
    }
    return DEFAULT_LANGUAGE;
}

// Empty when the player never picked one, which means "follow the system".
export function getLanguageSetting() {
    const saved = localStorage.getItem(LANGUAGE_KEY) || '';
    return isSupported(saved) ? saved : '';
}

export function getLanguage() {
    return getLanguageSetting() || systemLanguage();
}

const listeners = new Set();

// Pass '' to go back to following the system language.
export function setLanguage(code) {
    if (code && isSupported(code)) {
        localStorage.setItem(LANGUAGE_KEY, code);
    } else {
        localStorage.removeItem(LANGUAGE_KEY);
    }
    applyDocumentLanguage();
    listeners.forEach(listener => listener());
}

export function applyDocumentLanguage() {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = getLanguage();
    }
}

function lookup(language, key) {
    let value = messages[language];
    for (const part of key.split('.')) {
        value = value?.[part];
    }
    return value;
}

// Fills "{name}" placeholders. A message can be { one, other } (and any other plural
// category) to change with `vars.count`.
function format(language, message, vars) {
    if (message && typeof message === 'object') {
        const category = new Intl.PluralRules(language).select(Number(vars?.count) || 0);
        message = message[category] ?? message.other;
    }
    if (typeof message !== 'string') {
        return undefined;
    }
    return message.replace(/\{(\w+)\}/g, (match, name) =>
        vars && Object.hasOwn(vars, name) ? String(vars[name]) : match,
    );
}

// Translates a key such as "settings.title". Missing Spanish text falls back to
// English, and a missing key shows the key itself so it is easy to spot.
export function t(key, vars) {
    const language = getLanguage();
    return (
        format(language, lookup(language, key), vars) ??
        format(DEFAULT_LANGUAGE, lookup(DEFAULT_LANGUAGE, key), vars) ??
        key
    );
}

// Dates and numbers in the chosen language.
export function formatDate(value, options) {
    const date = new Date(value);
    return isNaN(date) ? '' : date.toLocaleDateString(getLanguage(), options);
}

export function formatDateTime(value, options) {
    const date = new Date(value);
    return isNaN(date) ? '' : date.toLocaleString(getLanguage(), options);
}

export function formatNumber(value, options) {
    return new Intl.NumberFormat(getLanguage(), options).format(value);
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Components call this so they redraw when the language changes. It returns `t`;
// every other helper here reads the current language on its own.
export function useTranslation() {
    const language = useSyncExternalStore(subscribe, getLanguage);
    return { t, language };
}
