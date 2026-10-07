import { mount } from 'svelte';
import '@/ui/fonts.css';
import '@/ui/tokens.css';
import App from './App.svelte';

// Inside a frame on someone else's page, an "Open anyway" button could be clickjacked: show nothing.
if (window.top === window) mount(App, { target: document.getElementById('app')! });
