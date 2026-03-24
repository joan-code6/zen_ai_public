import { useEffect, useState } from 'react';
import AuthService from '@/services/authService';
import { getBackendUrl } from '@/lib/backend';

/**
 * Hook that converts an authenticated download path to a blob URL for image display.
 * This avoids CORS issues by fetching the image with proper auth headers and creating a blob URL.
 */
export function useImageUrl(downloadPath: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!downloadPath) {
      setBlobUrl(null);
      return;
    }

    let isMounted = true;

    const loadImage = async () => {
      try {
        const token = await AuthService.getValidToken();
        if (!token) {
          setError('Not authenticated');
          return;
        }

        const backendUrl = getBackendUrl();
        if (!backendUrl) {
          setError('Backend URL not configured');
          return;
        }

        const fullUrl = new URL(downloadPath, backendUrl).toString();
        console.log('Fetching image from:', fullUrl);

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (isMounted) {
          setBlobUrl(url);
          setError(null);
        } else {
          // Clean up if component unmounted
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Error loading image:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setBlobUrl(null);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [downloadPath]);

  return blobUrl;
}
