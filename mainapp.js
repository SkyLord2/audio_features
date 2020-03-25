const context = new AudioContext();

// Get a canvas defined with ID "oscilloscope"
const canvas = document.getElementById('oscilloscope');
canvas.width = 600;
canvas.height = 300;
const canvasCtx = canvas.getContext('2d');

const canvas_fftSeries = document.getElementById('fft-series');
const context_fftSeries = canvas_fftSeries.getContext('2d');
canvas_fftSeries.width = 600;
canvas_fftSeries.height = 300;

const canvas_fftSeries_mel = document.getElementById('fft-series mel');
const context_fftSeries_mel = canvas_fftSeries_mel.getContext('2d');
canvas_fftSeries_mel.width = 600;
canvas_fftSeries_mel.height = 300;

// FT Stuff
// 48 kHz sampling rate, 1024 samples => 21.3 ms
const BUFFERSIZE = 256;
const B2P1 = BUFFERSIZE / 2 + 1;
const dft = new DFT(BUFFERSIZE);
let timeDomainData = [];

const FRAMESIZE = 200; // How many frames of size BUFFERSIZE
const nMelFilter = 26; // Number of Mel Filterbanks
let DFT_Series = []; // ringbuffer
let DFT_Series_mel = []; // ringbuffer
let DFT_Series_pos = FRAMESIZE - 1; // head of ringbuffer

const filter = mel_filter();
let samplerate = context.sampleRate;
filter.init(samplerate, BUFFERSIZE, 0, samplerate / 2, nMelFilter);

// Prefill arrays
for (let idx = 0; idx < FRAMESIZE; idx++) {
  let ft_array = Array.from(Array(B2P1), () => 0);
  DFT_Series.push(ft_array);

  let mel_array = Array.from(Array(nMelFilter), () => 0);
  DFT_Series_mel.push(mel_array);
}

// Color map css style
const grayscale = [];
for (let idx = 0; idx < 256; idx++) {
  grayscale[idx] = `rgb(${idx}, ${idx}, ${idx})`;
}

/**
 * Handle mic data
 */
const handleSuccess = function(stream) {
  console.log('handle success');
  const source = context.createMediaStreamSource(stream);

  // Create a ScriptProcessorNode
  const processor = context.createScriptProcessor(BUFFERSIZE, 1, 1);
  source.connect(processor);
  processor.connect(context.destination);

  processor.onaudioprocess = function(e) {
    const inputBuffer = e.inputBuffer;
    timeDomainData = inputBuffer.getChannelData(0);

    // Do the Fourier Transformation
    dft.forward(timeDomainData);

    // Shift head of ringbuffer
    DFT_Series_pos++;
    if (DFT_Series_pos > FRAMESIZE - 1) {
      DFT_Series_pos = 0;
    }

    // now it gets a little messy ...
    // range of dft.mag: [0, about 100]
    // define min value: e.g. 0.01 => min value exp = 2 (10^{-2})
    // 1. map mag in range [min value, 100]
    // 2. log10 -> range [-min value exp, 2]
    // 3. shift by +(min value exp) -> range [0, 2 + min value exp], in this example [0, 4]
    // 4. map values to [0, 255]
    const min_val = 0.1;
    const min_val_exp = Math.abs(Math.log10(min_val));
    const max_val = 100;
    const max_val_exp = Math.log10(max_val);
    let mag = 0;
    for (let idx = 0; idx < B2P1; idx++) {
      mag = dft.mag[idx];
      mag = mag < min_val ? min_val : mag;
      mag = mag > max_val ? max_val : mag;

      mag = Math.log10(mag);
      mag += min_val_exp;

      mag = map(mag, 0, min_val_exp + max_val_exp, 255, 0);
      mag = Math.floor(mag);
      DFT_Series[DFT_Series_pos][idx] = mag;
    }

    // Copy aaray of mel coefficients
    DFT_Series_mel[DFT_Series_pos] = Array.from(filter.getMelCoefficients(dft.mag));
  };
};

/** Kicks off Mic data handle function
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 */
navigator.mediaDevices
  .getUserMedia({ audio: true, video: false })
  .then(handleSuccess)
  .catch(err => console.log(err));

/**
 * Recursive draw function
 * Called as fast as possible by the browser (as far as I understood)
 */
let counter = -1;
let drawEveryFrame = 1;
const draw = function() {
  requestAnimationFrame(draw);

  counter++;
  if (counter % drawEveryFrame) {
    return;
  }

  canvasCtx.fillStyle = '#FFF';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw magnitudes
  let barWidth = canvas.width / B2P1;
  let barHeight;
  let mag = 0;
  let x = 0;
  for (let i = 0; i < B2P1; i++) {
    mag = DFT_Series[DFT_Series_pos][i];
    barHeight = -canvas.height + map(mag, 0, 255, 0, canvas.height);
    canvasCtx.fillStyle = grayscale[mag];
    canvasCtx.fillRect(x, canvas.height, barWidth, barHeight);
    x += barWidth;
  }
  canvasCtx.strokeRect(0, 0, canvas.width, canvas.height);

  // Draw time series on top
  canvasCtx.beginPath();
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = '#000099';
  let sliceWidth = canvas.width / BUFFERSIZE;
  x = 0;
  for (let i = 0; i < BUFFERSIZE; i++) {
    let v = timeDomainData[i] + 1;
    let y = (v * canvas.height) / 2;
    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }
    x += sliceWidth;
  }
  //canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();

  // Draw FT Time Series
  context_fftSeries.fillStyle = '#FFF';
  context_fftSeries.fillRect(0, 0, canvas_fftSeries.width, canvas_fftSeries.height);

  let rectHeight = canvas_fftSeries.height / B2P1;
  let rectWidth = canvas_fftSeries.width / FRAMESIZE;
  let xpos = 0;
  let ypos;
  for (let xidx = DFT_Series_pos + 1; xidx <= DFT_Series_pos + FRAMESIZE; xidx++) {
    ypos = canvas_fftSeries.height;
    for (let yidx = 0; yidx < B2P1; yidx++) {
      mag = DFT_Series[xidx % FRAMESIZE][yidx];
      if (mag != 0) {
        context_fftSeries.fillStyle = grayscale[mag];
        context_fftSeries.fillRect(xpos, ypos, rectWidth, -rectHeight);
      } else {
        //
      }
      ypos -= rectHeight;
    }
    xpos += rectWidth;
  }
  context_fftSeries.strokeRect(0, 0, canvas_fftSeries.width, canvas_fftSeries.height);

  // Draw mel spectrum
  context_fftSeries_mel.fillStyle = '#FFF';
  context_fftSeries_mel.fillRect(0, 0, canvas_fftSeries.width, canvas_fftSeries.height);

  rectHeight = canvas_fftSeries_mel.height / nMelFilter;
  rectWidth = canvas_fftSeries_mel.width / FRAMESIZE;
  xpos = 0;
  for (let xidx = DFT_Series_pos + 1; xidx <= DFT_Series_pos + FRAMESIZE; xidx++) {
    ypos = canvas_fftSeries_mel.height;
    for (let yidx = 0; yidx < nMelFilter; yidx++) {
      mag = DFT_Series_mel[xidx % FRAMESIZE][yidx];
      if (mag != 0) {
        context_fftSeries_mel.fillStyle = grayscale[Math.floor(map(mag, 0, 10, 255, 0))];
        context_fftSeries_mel.fillRect(xpos, ypos, rectWidth, -rectHeight);
      } else {
        //
      }
      ypos -= rectHeight;
    }
    xpos += rectWidth;
  }
  context_fftSeries_mel.strokeRect(0, 0, canvas_fftSeries_mel.width, canvas_fftSeries_mel.height);
}; // end draw fcn

draw();
