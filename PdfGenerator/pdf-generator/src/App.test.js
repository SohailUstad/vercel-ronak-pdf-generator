import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the weighbridge PDF generator', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /weighbridge pdf/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
});
