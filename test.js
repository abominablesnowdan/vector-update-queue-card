const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('vector-update-queue-card.js', 'utf8');
const registered = {};
class HTMLElement { attachShadow(){ this.shadowRoot = {}; } }
const context = { HTMLElement, customElements: { define: (n,c) => registered[n]=c }, window: {}, console };
vm.createContext(context); vm.runInContext(code, context);
if (!registered['vector-update-queue-card']) throw new Error('card not registered');
const Card = registered['vector-update-queue-card'];
const card = new Card(); card.setConfig({});
if (card.config.queue_entity !== 'sensor.vector_ops_queue') throw new Error('bad defaults');
console.log('card_contract=passed');
