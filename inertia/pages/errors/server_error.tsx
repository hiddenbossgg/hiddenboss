import type React from 'react'
import { Link } from '@adonisjs/inertia/react'

const ServerError: React.FC = () => {
  return (
    <>
      <h1>Something went wrong</h1>
      <p>An unexpected error stopped this page from loading. Try again in a moment.</p>
      <p className="not-found-back">
        <Link route="home">Go home</Link>
      </p>
    </>
  )
}

export default ServerError
