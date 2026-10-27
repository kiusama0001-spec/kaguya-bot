import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import { AuthTokenBridge } from './auth-bridge';
import { ErrorBoundary } from '@/components/error-boundary';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const app = clerkPublishableKey
  ? <ClerkProvider publishableKey={clerkPublishableKey}><AuthTokenBridge><App /></AuthTokenBridge></ClerkProvider>
  : <App />;

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(<ErrorBoundary>{app}</ErrorBoundary>);
