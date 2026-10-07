import { mount } from 'svelte';
import '@/ui/fonts.css';
import '@/ui/tokens.css';
import '@/ui/base.css';
import { followAppearance } from '@/ui/theme';
import App from './App.svelte';

void followAppearance();

// Inside a frame on someone else's page, an "Open anyway" button could be clickjacked: show nothing.
if (window.top === window) mount(App, { target: document.getElementById('app')! });
