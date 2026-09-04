import type React from 'react'

/** Curried so the JSX stays a bare `onClick={confirmSubmit(message)}`. */
export function confirmSubmit(message: string) {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) event.preventDefault()
  }
}
