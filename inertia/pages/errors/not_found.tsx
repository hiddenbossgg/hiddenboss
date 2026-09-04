import type React from 'react'
import { Link } from '@adonisjs/inertia/react'

const NotFound: React.FC = () => {
  return (
    <>
      <h1>Page not found</h1>
      <p>That page does not exist, or the link that brought you here is out of date.</p>
      <p className="not-found-back">
        <Link route="home">Go home</Link>
      </p>
    </>
  )
}

export default NotFound
