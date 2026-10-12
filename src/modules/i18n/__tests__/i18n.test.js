import { act, fireEvent, render, screen } from '@testing-library/react';
import en from '../locales/en';
import es from '../locales/es';
import { getLanguage, setLanguage, systemLanguage, t } from '..';
import LanguageSection from '../../components/settings/LanguageSection';

function setSystemLanguages(list) {
    Object.defineProperty(navigator, 'languages', { value: list, configurable: true });
}

afterEach(() => {
    setSystemLanguages(['en-US']);
    setLanguage('');
});

it('follows the system language and falls back to English', () => {
    setSystemLanguages(['es-MX', 'en-US']);
    expect(systemLanguage()).toBe('es');
    expect(t('settings.title')).toBe('Ajustes');

    setSystemLanguages(['fr-FR']);
    expect(getLanguage()).toBe('en');
    expect(t('settings.title')).toBe('Settings');
});

it('keeps the picked language over the system one', () => {
    setSystemLanguages(['en-US']);
    setLanguage('es');
    expect(getLanguage()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
});

it('fills placeholders and plurals, and shows unknown keys as is', () => {
    expect(t('settings.language.system', { name: 'English' })).toBe('System language (English)');
    expect(t('no.such.key')).toBe('no.such.key');
});

// Every English text needs a Spanish one, and placeholders must match so nothing
// shows a raw "{name}".
function leaves(tree, prefix = '') {
    return Object.entries(tree).flatMap(([key, value]) =>
        typeof value === 'string' ? [[prefix + key, value]] : leaves(value, `${prefix}${key}.`),
    );
}

function placeholders(text) {
    return (text.match(/\{\w+\}/g) || []).sort().join(',');
}

it('has the same texts and placeholders in English and Spanish', () => {
    const spanish = Object.fromEntries(leaves(es));
    const english = Object.fromEntries(leaves(en));
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(english)) {
        expect([key, placeholders(spanish[key])]).toEqual([key, placeholders(text)]);
    }
});

it('switches the language from Settings', () => {
    render(<LanguageSection />);
    act(() => {
        fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } });
    });
    expect(screen.getByLabelText('Idioma')).toHaveValue('es');
    expect(localStorage.getItem('tmods.language')).toBe('es');
});
