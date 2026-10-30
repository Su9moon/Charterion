import { mountRadar } from './radar';
mountRadar(document, window, window.fetch.bind(window));
