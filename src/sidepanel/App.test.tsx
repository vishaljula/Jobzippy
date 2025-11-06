import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('shows loading state initially', () => {
    render(<App />);
    expect(screen.getByText(/loading jobzippy/i)).toBeInTheDocument();
  });

  it('renders main content after loading', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/welcome to jobzippy/i)).toBeInTheDocument();
    });
  });

  it('displays the header with logo and status', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Jobzippy')).toBeInTheDocument();
      expect(screen.getByText('Your AI Job Assistant')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  it('renders all feature cards', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Auto-Apply')).toBeInTheDocument();
      expect(screen.getByText('Track Applications')).toBeInTheDocument();
      expect(screen.getByText('Daily Updates')).toBeInTheDocument();
      expect(screen.getByText('Privacy First')).toBeInTheDocument();
    });
  });

  it('renders Get Started button', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });
  });

  it('displays version number in footer', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    });
  });
});
