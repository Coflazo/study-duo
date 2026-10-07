import { mount } from 'svelte';
import '@/ui/fonts.css';
import '@/ui/tokens.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
