import { useState, useEffect } from 'react';

export function useBaseUrl(): string {
  const [baseUrl, setBaseUrl] = useState('https://your-domain.com');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  return baseUrl;
}
