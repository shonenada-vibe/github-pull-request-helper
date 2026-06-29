import { mount } from 'svelte';
import Options from './Options.svelte';
import '../../assets/tailwind.css';

const target = document.getElementById('app');
if (target) {
  mount(Options, { target });
}
