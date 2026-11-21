const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const handlers = new Map();
const keys = [];
const transform = new Map();
const classes = new Set();
const media = { matches: true, addEventListener() {} };
let onSlideChange;
const photo = { getBoundingClientRect: () => ({ left: 0, top: 140, width: 400, height: 320 }) };
const wrapper = {
  querySelector: () => photo,
  classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
  style: {
    transform: "translate(0px, 0px) scale(0.5)",
    setProperty: (name, value) => transform.set(name, value),
    removeProperty: (name) => transform.delete(name),
  },
};
const slide = { querySelector: () => wrapper };
const carousel = { style: { left: "0vw" }, children: [slide, slide] };
const display = {
  querySelector: () => carousel,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
};
const target = { closest: (selector) => selector.startsWith(".Lightbox") ? display : null };
const context = {
  window: { matchMedia: () => media, addEventListener() {} },
  document: {
    addEventListener: (name, callback) => handlers.set(name, callback),
    dispatchEvent: (event) => keys.push(event.key),
  },
  MutationObserver: class {
    constructor(callback) { onSlideChange = callback; }
    observe() {}
    disconnect() {}
  },
  KeyboardEvent: class {
    constructor(_, { key }) { this.key = key; }
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "lightboxGestures.js"), "utf8"), context);

function emit(name, touches, timeStamp, changedTouches = []) {
  const coordinates = (points) => points.map(([clientX, clientY]) => ({ clientX, clientY }));
  const event = {
    target, timeStamp,
    touches: coordinates(touches),
    changedTouches: coordinates(changedTouches),
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  handlers.get(name)(event);
  return event.prevented;
}

function drag(from, to, time) {
  emit("touchstart", [from], time);
  emit("touchmove", [to], time + 60);
  emit("touchend", [], time + 70, [to]);
}

function tap(point, time) {
  emit("touchstart", [point], time);
  emit("touchend", [], time + 15, [point]);
}

assert(emit("mouseup", [], 0));
assert(emit("click", [], 0));
tap([20, 300], 20);
assert.deepEqual(keys, []);
assert.equal(classes.size, 0);
drag([310, 300], [100, 315], 400);
drag([110, 300], [300, 315], 550);
drag([200, 150], [225, 390], 700);
assert.deepEqual(keys, ["ArrowRight", "ArrowLeft"]);

tap([270, 300], 900);
tap([275, 300], 1080);
assert(classes.has("smf-gesture-zoom"));
const zoomed = transform.get("--smf-gesture-transform");
assert.match(zoomed, /scale\(2\.5\)$/);
drag([250, 300], [0, 300], 1300);
const panned = transform.get("--smf-gesture-transform");
assert.notEqual(panned, zoomed);
drag([390, 300], [0, 300], 1500);
assert.equal(transform.get("--smf-gesture-transform"), panned);
assert.deepEqual(keys, ["ArrowRight", "ArrowLeft"]);

tap([200, 300], 1800);
tap([200, 300], 1950);
assert.equal(classes.size, 0);

emit("touchstart", [[150, 300]], 2300);
emit("touchstart", [[150, 300], [250, 300]], 2305);
emit("touchmove", [[75, 300], [325, 300]], 2370);
assert.match(transform.get("--smf-gesture-transform"), /scale\(2\.5\)$/);
emit("touchmove", [[151, 300], [249, 300]], 2400);
emit("touchend", [[151, 300]], 2430);
emit("touchmove", [[300, 300]], 2480);
emit("touchend", [], 2490, [[300, 300]]);
assert.deepEqual(keys, ["ArrowRight", "ArrowLeft"]);
assert.equal(classes.size, 0);

tap([200, 300], 2800);
tap([200, 300], 2950);
carousel.style.left = "-100vw";
onSlideChange();
assert.equal(classes.size, 0);
assert.equal(transform.size, 0);

media.matches = false;
assert.equal(emit("mouseup", [], 3200), undefined);
drag([350, 300], [100, 300], 3300);
assert.deepEqual(keys, ["ArrowRight", "ArrowLeft"]);
console.log("PASS touch lightbox swipes, double taps, bounded pan, pinch, and desktop fallback");
