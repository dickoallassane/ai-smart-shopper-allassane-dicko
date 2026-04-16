import '../styles/extension-ui.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PopupApp } from './PopupApp'

const queryClient = new QueryClient()

const Root = () => {
  const [client] = useState(() => queryClient)
  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <PopupApp />
      </QueryClientProvider>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
