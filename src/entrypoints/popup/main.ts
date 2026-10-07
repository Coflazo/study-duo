import { mount } from 'svelte';
import '@/ui/fonts.css';
import '@/ui/tokens.css';
import '@/ui/base.css';
import { followAppearance } from '@/ui/theme';
import App from './App.svelte';

void followAppearance();
mount(App, { target: document.getElementById('app')! });
