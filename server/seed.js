// server/seed.js
// Demo products used on first start and by the "npm run reset" script.
// Images point at hand-made SVG illustrations inside public/img/products/.
'use strict';

const seedProducts = [
  {
    name: 'Aurora RGB Mechanical Keyboard',
    description:
      'Hot-swappable 75% mechanical keyboard with per-key RGB, gasket mount and PBT keycaps. USB-C, wireless and Bluetooth modes.',
    price: 129.99,
    category: 'Keyboards',
    image: '/img/products/keyboard.svg',
  },
  {
    name: 'Pulse Ultralight Gaming Mouse',
    description:
      '63-gram wireless mouse with a 26K DPI optical sensor, PTFE feet and 70-hour battery life. Built for fast-paced competitive play.',
    price: 74.5,
    category: 'Mice',
    image: '/img/products/mouse.svg',
  },
  {
    name: 'Echo Pro Wireless Headset',
    description:
      'Wireless over-ear headset with 50 mm drivers, detachable boom mic and spatial audio. Comfortable memory-foam ear cushions.',
    price: 99.0,
    category: 'Audio',
    image: '/img/products/headset.svg',
  },
  {
    name: 'Vista 34" Ultrawide Monitor',
    description:
      '34-inch curved ultrawide QHD monitor with 165 Hz refresh rate, 1 ms response and adaptive sync. One cable USB-C dock built in.',
    price: 449.0,
    category: 'Monitors',
    image: '/img/products/monitor.svg',
  },
  {
    name: 'NovaFlow Creative Suite (Lifetime)',
    description:
      'Digital licence key for a full photo, video and vector design suite. Lifetime activation for one device, instant email delivery.',
    price: 59.99,
    category: 'Software',
    image: '/img/products/software.svg',
  },
  {
    name: 'Drift Wireless Controller',
    description:
      'Low-latency wireless gamepad with hall-effect joysticks, textured grips and programmable back buttons. PC and mobile ready.',
    price: 64.0,
    category: 'Controllers',
    image: '/img/products/gamepad.svg',
  },
];

module.exports = { seedProducts };
