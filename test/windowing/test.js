const _LENGTH = 10;
const _WEIGHTS_HAMMING_WINDOW = [];

(function init() {
for (let idx = 0; idx < _LENGTH; idx++) {
    _WEIGHTS_HAMMING_WINDOW[idx] = 0.54 - 0.45 * Math.cos((2 * Math.PI * idx) / (_LENGTH - 1));
}
})();
console.log('_WEIGHTS_HAMMING_WINDOW=', _WEIGHTS_HAMMING_WINDOW);