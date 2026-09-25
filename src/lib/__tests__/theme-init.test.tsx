/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';
import { ThemeInitScript, themeInitScript } from '../theme-init';

describe('ThemeInitScript', () => {
  it('renders a <script nonce="abc123"> with theme init content', () => {
    const { container } = render(<ThemeInitScript nonce="abc123" />);
    const script = container.querySelector('script') as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.nonce).toBe('abc123');
    expect(script.innerHTML).toContain('tb-theme');
    expect(script.innerHTML).toContain('prefers-color-scheme');
  });

  it('script body contains no eval/new Function', () => {
    expect(themeInitScript).not.toMatch(/\beval\s*\(/);
    expect(themeInitScript).not.toMatch(/\bnew\s+Function\s*\(/);
  });
});
