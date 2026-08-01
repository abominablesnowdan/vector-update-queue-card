const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('vector-update-queue-card.js', 'utf8');
const registered = {};
class HTMLElement { attachShadow(){ this.shadowRoot = {}; } }
const context = { HTMLElement, URL, customElements: { get: (n) => registered[n], define: (n,c) => registered[n]=c }, window: { location: { origin: 'https://homeassistant.dmhhome.uk' } }, console };
vm.createContext(context); vm.runInContext(code, context);
if (!registered['vector-update-queue-card']) throw new Error('queue card not registered');
if (!registered['vector-ops-overview-card']) throw new Error('overview card not registered');
const Card = registered['vector-update-queue-card'];
const card = new Card(); card.setConfig({});
if (card.config.queue_entity !== 'sensor.vector_ops_queue') throw new Error('bad queue defaults');
let queueRenders = 0; card.render = () => queueRenders++;
const queueStates = {
  'sensor.vector_ops_updates_available': {},
  'sensor.vector_ops_queue': {},
  'sensor.vector_ops_review_required': {},
};
card.hass = { states: queueStates };
card.hass = { states: { ...queueStates, 'sensor.unrelated': {} } };
if (queueRenders !== 1) throw new Error('queue card rerendered for unrelated state');
const Overview = registered['vector-ops-overview-card'];
const overview = new Overview(); overview.setConfig({});
if (overview.config.health_entity !== 'sensor.vector_ops_service_health') throw new Error('bad overview defaults');
let overviewRenders = 0; overview.render = () => overviewRenders++;
const overviewStates = Object.fromEntries([
  overview.config.health_entity, overview.config.infrastructure_entity, overview.config.backup_entity,
  overview.config.incidents_entity, overview.config.weather_entity, overview.config.updates_entity,
].map((id) => [id, {}]));
overview.hass = { states: overviewStates };
overview.hass = { states: { ...overviewStates, 'sensor.unrelated': {} } };
if (overviewRenders !== 1) throw new Error('overview card rerendered for unrelated state');
console.log('card_contract=passed');
