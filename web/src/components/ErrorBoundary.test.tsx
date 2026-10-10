import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

describe('view error recovery', () => {
  it('provides a retry action without error details and allows navigation to another view', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never { throw new Error('Internal secret stack/details') }
    const { rerender } = render(<ErrorBoundary key="map" resetKey="map"><Broken /></ErrorBoundary>)
    expect(screen.getByRole('button', { name: 'Retry view' })).toBeTruthy()
    expect(screen.queryByText(/Internal secret/)).toBeNull()
    rerender(<ErrorBoundary key="settings" resetKey="settings"><h2>Settings recovered</h2></ErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'Settings recovered' })).toBeTruthy()
    silence.mockRestore()
  })
})
