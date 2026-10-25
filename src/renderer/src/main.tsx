import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './app/Shell';
import { PwaUpdatePrompt } from './app/PwaUpdatePrompt';
import { openRepository } from './storage';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <>
      <PwaUpdatePrompt />
      <Shell repo={openRepository()} />
    </>
  </StrictMode>,
);
