'use client';


import { useState, useEffect } from 'react';
import { resolveSlugClient, type SlugResolution } from '@/lib/resolve-slug';

export function useSlug(): SlugResolution | null {
  const [resolution, setResolution] = useState<SlugResolution | null>(null);

  useEffect(() => {
    setResolution(resolveSlugClient());
  }, []);

  return resolution;
}